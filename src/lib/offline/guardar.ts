import { debeTrabajarLocal, fetchConTimeout } from "@/lib/offline/conexion";
import { enqueueLote } from "@/lib/offline/queue";
import { peticionDe, type OperacionCola } from "@/lib/offline/cola/peticiones";

/**
 * Guardado de los formularios: servidor si se puede, teléfono si no.
 *
 * Antes cada formulario tenía dos caminos escritos a mano — "sin señal →
 * encolar" y "con señal → fetch" — y el segundo, con señal mala, terminaba
 * en "la red tardó demasiado, vuelve a intentarlo" con el cliente enfrente.
 * Aquí hay uno solo:
 *
 * 1. Sin señal o en modo local → se encola directo.
 * 2. Con señal → se manda. Si la red falla, tarda o el servidor responde 5xx
 *    → se encola LA MISMA petición con LA MISMA Idempotency-Key. Si el
 *    servidor sí la había aplicado, al reintentar la reconoce y devuelve el
 *    resultado guardado; si no, la aplica. Nunca dos veces.
 * 3. 4xx → es un rechazo de validación: se le muestra al usuario para que
 *    corrija, no se encola (reintentar daría lo mismo).
 *
 * La operación viaja idéntica por los dos caminos porque ambos usan
 * `peticionDe` y los ids (contrata, cliente, cita…) se generan en el
 * teléfono antes de mandarla.
 */

/**
 * Espera del intento directo. Más corta que la de la cola: aquí hay una
 * persona esperando con el cliente enfrente, y rendirse pronto no pierde
 * nada — la operación pasa a la cola, que sí espera lo necesario.
 */
export const TIMEOUT_INTENTO_DIRECTO_MS = 10_000;

export type ResultadoGuardado<T> =
  /** El servidor la confirmó; `datos` es su respuesta. */
  | { enServidor: true; datos: T }
  /** Quedó en el teléfono (efecto local ya aplicado); se sube sola. */
  | { enServidor: false };

/** El servidor validó la operación y la rechazó (4xx): hay que corregir algo. */
export class RechazoDelServidor extends Error {
  constructor(
    mensaje: string,
    readonly status: number
  ) {
    super(mensaje);
    this.name = "RechazoDelServidor";
  }
}

export async function guardarOperacion<T>(opts: {
  /** Sin owner (sesión aún cargando) no hay cola: solo intento directo. */
  ownerId: string | null | undefined;
  /** Idempotency-Key estable entre reintentos del mismo guardado (useIdempotencia). */
  clave: string;
  /** La operación principal primero; después lo que va ligado (p. ej. el enlace con la cita). */
  lote: OperacionCola[];
}): Promise<ResultadoGuardado<T>> {
  const { ownerId, clave, lote } = opts;
  const [principal, ...ligadas] = lote;

  const aLaCola = async (): Promise<ResultadoGuardado<T>> => {
    await enqueueLote(ownerId!, lote, { clave });
    return { enServidor: false };
  };

  if (ownerId && debeTrabajarLocal()) return aLaCola();

  let res: Response;
  try {
    const { url, init } = peticionDe(principal);
    res = await fetchConTimeout(
      url,
      { ...init, headers: { ...(init.headers ?? {}), "Idempotency-Key": clave } },
      TIMEOUT_INTENTO_DIRECTO_MS
    );
  } catch (e) {
    if (!ownerId) throw e;
    return aLaCola();
  }

  if (res.status >= 500 && ownerId) return aLaCola();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new RechazoDelServidor(
      typeof data.error === "string" ? data.error : "No se pudo guardar",
      res.status
    );
  }

  const datos = (await res.json()) as T;
  if (ownerId && ligadas.length > 0) {
    // Lo ligado (enlace con la cita) va por la cola normal: con señal se
    // sube de inmediato. Si ya no cabe, la operación principal sí quedó
    // guardada y la cita se ve pendiente — no se oculta nada.
    await enqueueLote(ownerId, ligadas).catch(() => undefined);
  }
  return { enServidor: true, datos };
}
