import * as Sentry from "@sentry/nextjs";
import { conIndexedDBSano, esFallaIndexedDB, reabrirIndexedDB } from "@/lib/offline/dexie-retry";
import { reportarError } from "@/lib/report-error";
import { db, type QueueOpType, type WriteQueueItem } from "@/lib/offline/db";
import { applyLocalEffect } from "@/lib/offline/effects";
import {
  calidadConexion,
  fetchConTimeout,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";
import { LIMITE_OPERACIONES_LOCALES, LimiteOfflineError } from "@/lib/offline/modo-local";
import { peticionDe, type OperacionCola } from "@/lib/offline/cola/peticiones";
import { entidadesDe } from "@/lib/offline/cola/entidades";
import {
  deshacerEfectoLocal,
  reconciliarTrasExito,
  refrescarTrasDeshacer,
} from "@/lib/offline/cola/reconciliar";
import {
  marcarEnviando,
  marcarTerminado,
  programarReintento,
  reiniciarEsperas,
  type ResumenEnvio,
} from "@/lib/offline/cola/estado";

export type { OperacionCola } from "@/lib/offline/cola/peticiones";
export { entidadesDe } from "@/lib/offline/cola/entidades";

/* ── Encolar ─────────────────────────────────────────────────────────── */

/**
 * Aplica el efecto local de inmediato (UI optimista) y encola la mutación
 * real. La idempotency key viaja en el header al vaciar la cola, así un
 * reintento tras perder la respuesta no duplica nada.
 */
export async function enqueue(
  ownerId: string,
  type: QueueOpType,
  payload: Record<string, unknown>
): Promise<void> {
  await enqueueLote(ownerId, [{ type, payload }]);
}

/**
 * Encola varias operaciones como una sola unidad: o entran todas o ninguna
 * (p. ej. una entrega y el enlace con su cita). Encolarlas sueltas dejaba
 * registros a medias cuando la segunda chocaba con el límite.
 *
 * `clave`: Idempotency-Key de la PRIMERA operación. La pasa `guardar.ts`
 * cuando la operación ya se intentó mandar directo y se cayó la red: el
 * servidor pudo haberla aplicado, y solo reconociendo la misma clave evita
 * aplicarla otra vez. Sin ella, la clave es el id del elemento de la cola.
 *
 * El conteo contra LIMITE_OPERACIONES_LOCALES va DENTRO de la transacción
 * para que dos encolados simultáneos no se pasen del techo.
 */
export async function enqueueLote(
  ownerId: string,
  ops: OperacionCola[],
  opciones: { clave?: string } = {}
): Promise<void> {
  const database = db;
  if (!database || ops.length === 0) return;
  const base = Date.now();
  await database.transaction(
    "rw",
    // Toda tabla que `applyLocalEffect` pueda tocar tiene que estar en el
    // alcance de la transacción: Dexie lanza si el efecto escribe en una
    // que no se declaró aquí.
    [
      database.writeQueue,
      database.clientes,
      database.contratas,
      database.pagos,
      database.deudores,
      database.abonosDeudor,
      database.citas,
    ],
    async () => {
      // Las rechazadas ("conflict") no cuentan: no van a subir y no deben
      // comerse el cupo antes de llegar a 100 movimientos reales.
      const acumuladas = await database.writeQueue
        .where("ownerId")
        .equals(ownerId)
        .filter((op) => op.status !== "conflict")
        .count();
      if (acumuladas + ops.length > LIMITE_OPERACIONES_LOCALES) throw new LimiteOfflineError();
      for (let i = 0; i < ops.length; i++) {
        const { type, payload } = ops[i];
        await database.writeQueue.add({
          id: crypto.randomUUID(),
          clave: i === 0 ? opciones.clave ?? null : null,
          ownerId,
          type,
          payload,
          // +i ms: la cola se ordena por createdAt y dentro del lote el
          // orden importa (la contrata antes que el enlace de su cita).
          createdAt: new Date(base + i).toISOString(),
          status: "pending",
          attempts: 0,
        });
        await applyLocalEffect(type, payload);
      }
    }
  );
  void flushQueue(ownerId);
}

/* ── Vaciar ──────────────────────────────────────────────────────────── */

/**
 * Candado de envío. Guarda cuándo avanzó por última vez: si la app pasó a
 * segundo plano a media petición, el navegador puede congelar ese flush
 * para siempre (iOS) y el candado se quedaría tomado — pasado este tiempo
 * sin avance se considera abandonado y el siguiente flush lo retoma. Es
 * seguro: cada operación viaja con su Idempotency-Key.
 */
const CANDADO_ABANDONADO_MS = TIMEOUT_ESCRITURA_MS * 2 + 10_000;
let candado: { owner: string; ultimoAvance: number } | null = null;

// Un flush pedido mientras otro corre no se pierde: se repite al terminar.
// (Bug de campo: el segundo cobro de "Cobrado" con 2 contratas se quedaba
// "pending" porque su flush llegaba con el primero todavía en vuelo.)
let reflushPendiente: string | null = null;

function tomarCandado(ownerId: string): boolean {
  if (candado && Date.now() - candado.ultimoAvance < CANDADO_ABANDONADO_MS) return false;
  candado = { owner: ownerId, ultimoAvance: Date.now() };
  return true;
}

function avanzar() {
  if (candado) candado.ultimoAvance = Date.now();
}

/** Vacía la cola en orden de creación contra las rutas API reales. */
export async function flushQueue(ownerId: string): Promise<ResumenEnvio | null> {
  // A diferencia del pull-sync, la cola SÍ se vacía en red lenta: son
  // escrituras que el usuario ya dio por hechas. Las protege el techo de
  // espera de `fetchConTimeout`.
  if (!db || calidadConexion() === "sin-red") return null;
  if (!tomarCandado(ownerId)) {
    reflushPendiente = ownerId;
    return null;
  }
  const miCandado = candado;
  marcarEnviando();
  const resumen: ResumenEnvio = { enviadas: 0, rechazadas: 0, interrumpida: false, terminadoEn: 0 };
  try {
    await vaciar(ownerId, resumen);
  } catch (err) {
    // Conexión local muerta aun después de reintentar: no es un error de la
    // operación. Se reabre y se reintenta la cola más tarde, en vez de
    // dejar una promesa rechazada sin manejar (un reporte por cada intento).
    if (!esFallaIndexedDB(err)) throw err;
    resumen.interrumpida = true;
    void reabrirIndexedDB().catch(() => undefined);
  } finally {
    resumen.terminadoEn = Date.now();
    // Si otro flush retomó un candado abandonado, ese ya es el dueño.
    if (candado === miCandado) candado = null;
    marcarTerminado(resumen);
    if (resumen.interrumpida) programarReintento(() => void flushQueue(ownerId));
    else reiniciarEsperas();
    if (reflushPendiente) {
      const siguiente = reflushPendiente;
      reflushPendiente = null;
      void flushQueue(siguiente);
    }
  }
  return resumen;
}

async function vaciar(ownerId: string, resumen: ResumenEnvio): Promise<void> {
  const database = db!;
  const pendientes = (await database.writeQueue.where("ownerId").equals(ownerId).toArray())
    // "syncing" incluido a propósito: una petición que nunca resolvió (la
    // app se cerró a media petición) quedaría excluida para siempre. Es
    // seguro reintentarla gracias a la Idempotency-Key.
    .filter((op) => op.status === "pending" || op.status === "failed" || op.status === "syncing")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Registros tocados por una operación rechazada en esta pasada. Lo que
  // venga después y los toque se aparta también, en su orden: aplicarlo sin
  // la anterior da resultados que el usuario nunca vio (un toggle rechazado
  // seguido de otro invierte el pago; un `cita.entregar` apuntaría a una
  // contrata que no existe). `reintentarConflictos` las regresa juntas.
  const bloqueadas = new Set<string>();

  try {
    for (const op of pendientes) {
      avanzar();
      const entidades = entidadesDe(op.payload);

      if (entidades.some((e) => bloqueadas.has(e))) {
        entidades.forEach((e) => bloqueadas.add(e));
        await apartar(op, "Depende de una operación rechazada");
        resumen.rechazadas++;
        continue;
      }

      const resultado = await enviar(op);
      if (resultado === "ok") {
        // El servidor ya la aplicó; si iOS falla al sacarla de la cola local
        // (bug de IndexedDB, ver dexie-retry.ts) se reabre la conexión y se
        // reintenta. Antes la operación se quedaba en la cola y se reenviaba
        // en cada pasada (sin duplicarse gracias a la Idempotency-Key, pero
        // generando un error por intento).
        await conIndexedDBSano(() => database.writeQueue.delete(op.id));
        await reconciliarTrasExito(ownerId, op);
        resumen.enviadas++;
        continue;
      }
      if (resultado === "rechazada") {
        entidades.forEach((e) => bloqueadas.add(e));
        resumen.rechazadas++;
        continue;
      }
      // Red o 5xx: transitorio. Se detiene para respetar el orden y se
      // reintenta sola más tarde (ver `programarReintento`).
      resumen.interrumpida = true;
      break;
    }
  } finally {
    if (resumen.rechazadas > 0) await refrescarTrasDeshacer(ownerId);
  }
}

/** Manda una operación. Deja su estado en la cola según lo que respondió el servidor. */
async function enviar(op: WriteQueueItem): Promise<"ok" | "rechazada" | "reintentar"> {
  const database = db!;
  await database.writeQueue.update(op.id, { status: "syncing" });
  let res: Response;
  try {
    const { url, init } = peticionDe(op);
    res = await fetchConTimeout(
      url,
      { ...init, headers: { ...(init.headers ?? {}), "Idempotency-Key": op.clave ?? op.id } },
      TIMEOUT_ESCRITURA_MS
    );
  } catch (err) {
    await database.writeQueue.update(op.id, {
      status: "failed",
      attempts: op.attempts + 1,
      lastError: err instanceof Error ? err.message : "Error de red",
    });
    return "reintentar";
  }
  if (res.ok) return "ok";

  if (res.status >= 500) {
    await database.writeQueue.update(op.id, {
      status: "failed",
      attempts: op.attempts + 1,
      lastError: `HTTP ${res.status}`,
    });
    return "reintentar";
  }

  // 4xx: rechazo definitivo de ESTA operación (el servidor la validó y no
  // aplica). Se aparta, se reporta con el detalle real para poder
  // diagnosticar, y se deshace lo que su efecto mostraba en el teléfono.
  const detalle = await res.json().catch(() => null);
  const motivo =
    (detalle && typeof detalle.error === "string" && detalle.error) || `HTTP ${res.status}`;
  await apartar({ ...op, attempts: op.attempts + 1 }, motivo);
  Sentry.captureMessage("Operación offline en conflicto (4xx)", {
    level: "warning",
    extra: { opId: op.id, type: op.type, status: res.status, detalle, payload: op.payload },
  });
  reportarError({
    origen: "queue",
    mensaje: `Operación "${op.type}" en conflicto (HTTP ${res.status})`,
    contexto: { opId: op.id, type: op.type, status: res.status, detalle, payload: op.payload },
  });
  return "rechazada";
}

/** Deja la operación en "conflicto" (no se reintenta sola) y deshace su efecto local. */
async function apartar(op: WriteQueueItem, motivo: string): Promise<void> {
  await db!.writeQueue.update(op.id, {
    status: "conflict",
    attempts: op.attempts,
    lastError: motivo,
  });
  await deshacerEfectoLocal(op);
}

/* ── Acciones manuales sobre lo atorado ──────────────────────────────── */

/**
 * Reintenta a mano lo apartado ("conflict") o atorado ("syncing"). Solo
 * tiene sentido si la causa ya se resolvió; si persiste, vuelve a quedar
 * apartada. Las operaciones se reenvían en su orden original.
 */
export async function reintentarConflictos(ownerId: string): Promise<ResumenEnvio | null> {
  const database = db;
  if (!database) return null;
  await database.writeQueue
    .where("ownerId")
    .equals(ownerId)
    .filter((op) => op.status === "conflict" || op.status === "syncing")
    .modify({ status: "pending" });
  return flushQueue(ownerId);
}

/**
 * Descarta una operación apartada: el usuario revisó el motivo y decidió
 * que no va. Su efecto local ya se deshizo al apartarla; aquí solo se saca
 * de la cola y se trae el estado real de lo que tocaba.
 */
export async function descartarOperacion(ownerId: string, opId: string): Promise<void> {
  const database = db;
  if (!database) return;
  const op = await database.writeQueue.get(opId);
  if (!op || op.ownerId !== ownerId || op.status !== "conflict") return;
  await database.writeQueue.delete(opId);
  await deshacerEfectoLocal(op);
  if (calidadConexion() !== "sin-red") await refrescarTrasDeshacer(ownerId);
}

/* ── Consultas ───────────────────────────────────────────────────────── */

export async function pendingCount(ownerId: string): Promise<number> {
  const database = db;
  if (!database) return 0;
  return database.writeQueue.where("ownerId").equals(ownerId).count();
}

/** Cuántas operaciones más caben antes del límite de seguridad. */
export async function espacioEnCola(ownerId: string): Promise<number> {
  const database = db;
  if (!database) return LIMITE_OPERACIONES_LOCALES;
  const porSubir = await database.writeQueue
    .where("ownerId")
    .equals(ownerId)
    .filter((op) => op.status !== "conflict")
    .count();
  return Math.max(0, LIMITE_OPERACIONES_LOCALES - porSubir);
}

export async function conflictCount(ownerId: string): Promise<number> {
  const database = db;
  if (!database) return 0;
  return database.writeQueue
    .where("ownerId")
    .equals(ownerId)
    .filter((op) => op.status === "conflict")
    .count();
}

export type DiagnosticoCola = {
  total: number;
  porEstado: Record<string, number>;
  items: Array<{
    id: string;
    type: QueueOpType;
    status: string;
    attempts: number;
    lastError?: string | null;
    createdAt: string;
  }>;
};

/**
 * Snapshot de la cola local para "Revisar y reparar sincronización" en
 * Config — diagnosticar en campo sin inspeccionar IndexedDB a mano.
 */
export async function diagnosticarCola(ownerId: string): Promise<DiagnosticoCola> {
  const database = db;
  if (!database) return { total: 0, porEstado: {}, items: [] };
  const items = await database.writeQueue.where("ownerId").equals(ownerId).toArray();
  const porEstado: Record<string, number> = {};
  for (const it of items) porEstado[it.status] = (porEstado[it.status] ?? 0) + 1;
  return {
    total: items.length,
    porEstado,
    items: items.map((it) => ({
      id: it.id,
      type: it.type,
      status: it.status,
      attempts: it.attempts,
      lastError: it.lastError,
      createdAt: it.createdAt,
    })),
  };
}
