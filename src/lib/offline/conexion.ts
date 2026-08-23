/**
 * Calidad de conexión y fetch con límite de tiempo.
 *
 * El problema que resuelve: `navigator.onLine` solo distingue "hay
 * interfaz de red" de "no hay". En 3G devuelve `true`, así que toda la app
 * tomaba el camino "hay internet" — sincronizaba, precargaba y esperaba
 * respuestas que tardaban minutos. Sin señal, en cambio, tomaba el camino
 * offline y respondía al instante. De ahí que en campo se sintiera peor con
 * 3G que sin nada.
 *
 * Aquí se distinguen tres estados y se le pone techo a toda espera de red.
 */

export type CalidadConexion = "rapida" | "lenta" | "sin-red";

/** Persistido: el usuario conoce el terreno mejor que cualquier heurística. */
const CLAVE_MODO_AHORRO = "kredired:modo-ahorro";

const EVENTO_CAMBIO = "kredired:conexion";

type NetworkInformation = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
};

function conexionDelNavegador(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as unknown as { connection?: NetworkInformation }).connection;
}

export function modoAhorroManual(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(CLAVE_MODO_AHORRO) === "1";
}

/**
 * Enciende/apaga el modo ahorro a mano. Avisa a toda la app en el mismo
 * tick (evento propio) — `storage` solo se dispara en OTRAS pestañas, así
 * que por sí solo no serviría para refrescar la que hizo el cambio.
 */
export function setModoAhorroManual(activo: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (activo) localStorage.setItem(CLAVE_MODO_AHORRO, "1");
  else localStorage.removeItem(CLAVE_MODO_AHORRO);
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

/** Tipos de red que en campo se comportan como "mejor no intentes nada pesado". */
const TIPOS_LENTOS = new Set(["slow-2g", "2g", "3g"]);

export function calidadConexion(): CalidadConexion {
  if (typeof navigator === "undefined") return "rapida"; // SSR
  if (!navigator.onLine) return "sin-red";
  if (modoAhorroManual()) return "lenta";

  const c = conexionDelNavegador();
  // `saveData` es el usuario pidiendo explícitamente ahorrar datos; hay que
  // respetarlo aunque la red sea rápida.
  if (c?.saveData) return "lenta";
  if (c?.effectiveType && TIPOS_LENTOS.has(c.effectiveType)) return "lenta";

  // Safari/iOS no expone navigator.connection: ahí no se puede distinguir y
  // se asume rápida. Para esos casos está el interruptor manual.
  return "rapida";
}

/** ¿Conviene ahorrar? (lenta o sin red). */
export function debeAhorrar(): boolean {
  return calidadConexion() !== "rapida";
}

/**
 * Se dispara con `online`/`offline`, con cambios de `navigator.connection`
 * y con el interruptor manual.
 */
export function suscribirseAConexion(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const c = conexionDelNavegador();
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  window.addEventListener(EVENTO_CAMBIO, cb);
  window.addEventListener("storage", cb);
  c?.addEventListener?.("change", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    window.removeEventListener(EVENTO_CAMBIO, cb);
    window.removeEventListener("storage", cb);
    c?.removeEventListener?.("change", cb);
  };
}

/* ── Fetch con techo de espera ─────────────────────────────────────────── */

/** Lecturas (pull-sync): si no llegó en este tiempo, seguimos con la caché. */
export const TIMEOUT_LECTURA_MS = 15_000;

/**
 * Escrituras (cola offline). Más holgado que una lectura: abandonar un
 * cobro demasiado pronto no lo cancela en el servidor, solo nos deja sin
 * saber si se aplicó. Es seguro reintentarlo porque cada operación viaja
 * con su Idempotency-Key y el servidor reserva la clave ANTES de ejecutar
 * (ver src/lib/idempotency.ts), así que un reintento nunca cobra dos veces.
 */
export const TIMEOUT_ESCRITURA_MS = 25_000;

export class TimeoutDeRed extends Error {
  constructor(ms: number) {
    super(`La red no respondió en ${Math.round(ms / 1000)}s`);
    this.name = "TimeoutDeRed";
  }
}

/**
 * Traduce un fallo de red a algo accionable en pantalla. Menciona
 * explícitamente que reintentar no duplica porque, en campo, la duda de "¿se
 * habrá guardado?" es lo que lleva a la gente a guardar dos veces.
 */
export function mensajeDeError(e: unknown, porDefecto = "No se pudo guardar"): string {
  if (e instanceof TimeoutDeRed) {
    return "La red tardó demasiado en responder. Vuelve a intentarlo: si ya se había guardado, no se duplicará.";
  }
  if (e instanceof TypeError) {
    return "No se pudo conectar. Revisa tu señal e intenta de nuevo.";
  }
  return e instanceof Error ? e.message : porDefecto;
}

/**
 * `fetch` que se rinde en vez de colgarse. Sin esto, en 3G una petición
 * puede quedarse abierta minutos: la cola de escritura se detenía en el
 * primer fetch colgado y ningún botón volvía de su estado "Guardando…".
 */
export async function fetchConTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = TIMEOUT_LECTURA_MS
): Promise<Response> {
  const control = new AbortController();
  const alarma = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: control.signal });
  } catch (e) {
    // Distinguir "se acabó el tiempo" de un abort ajeno o un fallo de red
    // real hace que el mensaje en pantalla sea accionable.
    if (e instanceof DOMException && e.name === "AbortError" && control.signal.aborted) {
      throw new TimeoutDeRed(ms);
    }
    throw e;
  } finally {
    clearTimeout(alarma);
  }
}
