import { db, type QueueOpType } from "@/lib/offline/db";
import { applyLocalEffect } from "@/lib/offline/effects";
import { syncContratas, syncDeudores, syncDeudorDetalle } from "@/lib/offline/sync";

const ENDPOINTS: Record<
  QueueOpType,
  (payload: Record<string, unknown>) => { url: string; init: RequestInit }
> = {
  "contrata.pago.toggle": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/toggle`,
    init: { method: "POST" },
  }),
  "contrata.pago.abonar": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/abonar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: p.monto }),
    },
  }),
  "contrata.pago.revertir": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/abonar`,
    init: { method: "DELETE" },
  }),
  "contrata.marcarDeuda": (p) => ({
    url: `/api/contratas/${p.contrataId}/marcar-deuda`,
    init: { method: "POST" },
  }),
  "contrata.eliminar": (p) => ({
    url: `/api/contratas/${p.contrataId}`,
    init: { method: "DELETE" },
  }),
  "deudor.abonar": (p) => ({
    url: `/api/deudores/${p.deudorId}/abonos`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha: p.fecha, monto: p.monto, notas: p.notas }),
    },
  }),
  "cliente.cobrarVencidas": (p) => ({
    url: `/api/clientes/${p.clienteId}/cobrar-vencidas`,
    init: { method: "POST" },
  }),
};

/**
 * Aplica el efecto local de inmediato (UI optimista) y encola la mutación
 * real. La idempotency key (mismo `id`) viaja en el header al vaciar la
 * cola, así un reintento tras perder la respuesta no duplica el pago.
 */
export async function enqueue(
  ownerId: string,
  type: QueueOpType,
  payload: Record<string, unknown>
): Promise<void> {
  const database = db;
  if (!database) return;
  const id = crypto.randomUUID();
  await database.transaction(
    "rw",
    [database.writeQueue, database.contratas, database.pagos, database.deudores, database.abonosDeudor],
    async () => {
      await database.writeQueue.add({
        id,
        ownerId,
        type,
        payload,
        createdAt: new Date().toISOString(),
        status: "pending",
        attempts: 0,
      });
      await applyLocalEffect(type, payload);
    }
  );
  void flushQueue(ownerId);
}

let flushing = false;

/** Vacía la cola en orden de creación contra las rutas API reales. */
export async function flushQueue(ownerId: string): Promise<void> {
  const database = db;
  if (
    !database ||
    flushing ||
    typeof navigator === "undefined" ||
    !navigator.onLine
  ) {
    return;
  }
  flushing = true;
  try {
    const pendientes = (
      await database.writeQueue.where("ownerId").equals(ownerId).toArray()
    )
      .filter((op) => op.status === "pending" || op.status === "failed")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const op of pendientes) {
      await database.writeQueue.update(op.id, { status: "syncing" });
      try {
        const { url, init } = ENDPOINTS[op.type](op.payload);
        const res = await fetch(url, {
          ...init,
          headers: { ...(init.headers ?? {}), "Idempotency-Key": op.id },
        });
        if (!res.ok) {
          const status = res.status;
          await database.writeQueue.update(op.id, {
            status: status >= 400 && status < 500 ? "conflict" : "failed",
            attempts: op.attempts + 1,
            lastError: `HTTP ${status}`,
          });
          // Un conflicto o fallo detiene el drenado de este owner para no
          // aplicar operaciones posteriores fuera de orden.
          break;
        }
        await database.writeQueue.delete(op.id);
        await limpiarDirtySiSinPendientes(op.payload);
        await reconciliarTrasExito(ownerId, op.type, op.payload);
      } catch (err) {
        await database.writeQueue.update(op.id, {
          status: "failed",
          attempts: op.attempts + 1,
          lastError: err instanceof Error ? err.message : "Error de red",
        });
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * Algunas operaciones tienen efectos del lado del servidor que el efecto
 * optimista simplificado no puede predecir por completo (p. ej. a qué
 * Deudor exacto se sumó el saldo al marcar una contrata como deuda). Tras
 * confirmarse, se refresca esa porción de la caché desde el servidor.
 */
async function reconciliarTrasExito(
  ownerId: string,
  type: QueueOpType,
  payload: Record<string, unknown>
) {
  if (type === "contrata.marcarDeuda") {
    await Promise.all([syncContratas(ownerId), syncDeudores(ownerId)]);
    return;
  }
  if (type === "deudor.abonar") {
    await syncDeudorDetalle(ownerId, payload.deudorId as string);
    return;
  }
  if (type === "cliente.cobrarVencidas") {
    const database = db;
    if (!database) return;
    const clienteId = payload.clienteId as string;
    const contratas = await database.contratas
      .where("clienteId")
      .equals(clienteId)
      .toArray();
    await Promise.all(
      contratas.map((c) => database.contratas.update(c.id, { _dirty: false }))
    );
    await syncContratas(ownerId);
    return;
  }
}

async function limpiarDirtySiSinPendientes(payload: Record<string, unknown>) {
  const database = db;
  if (!database) return;
  const contrataId = payload.contrataId as string | undefined;
  if (contrataId) {
    const quedan = await database.writeQueue
      .filter(
        (op) =>
          (op.payload as Record<string, unknown>).contrataId === contrataId &&
          op.status !== "conflict"
      )
      .count();
    if (quedan === 0) {
      const existe = await database.contratas.get(contrataId);
      if (existe) await database.contratas.update(contrataId, { _dirty: false });
    }
  }
  const deudorId = payload.deudorId as string | undefined;
  if (deudorId) {
    const quedan = await database.writeQueue
      .filter(
        (op) =>
          (op.payload as Record<string, unknown>).deudorId === deudorId &&
          op.status !== "conflict"
      )
      .count();
    if (quedan === 0) {
      const existe = await database.deudores.get(deudorId);
      if (existe) await database.deudores.update(deudorId, { _dirty: false });
    }
  }
}

export async function pendingCount(ownerId: string): Promise<number> {
  const database = db;
  if (!database) return 0;
  return database.writeQueue.where("ownerId").equals(ownerId).count();
}
