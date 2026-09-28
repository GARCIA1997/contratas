import { db, type QueueOpType, type WriteQueueItem } from "@/lib/offline/db";
import { formatMoneda } from "@/lib/utils";

/**
 * Texto legible de una operación de la cola, para que el cobrador sepa QUÉ
 * está pendiente o apartado ("Cobro cuota 3 · Juan Pérez") en vez de un
 * contador sin contexto.
 */

const VERBO: Record<QueueOpType, string> = {
  "contrata.pago.toggle": "Cobro / desmarcar cuota",
  "contrata.pago.abonar": "Abono a cuota",
  "contrata.pago.revertir": "Revertir abono",
  "contrata.marcarDeuda": "Pasar a deuda",
  "contrata.eliminar": "Eliminar contrata",
  "contrata.crear": "Entrega de contrata",
  "contrata.editar": "Edición de contrata",
  "contrata.renovar": "Renovación",
  "cliente.unificar": "Unificación",
  "deudor.abonar": "Abono de deudor",
  "cliente.cobrarVencidas": "Cobro de lo vencido",
  "cliente.abonarParcial": "Abono parcial",
  "cita.crear": "Cita agendada",
  "cita.editar": "Cita reagendada",
  "cita.cancelar": "Cita cancelada",
  "cita.entregar": "Cita entregada",
  "cliente.crear": "Alta de cliente",
  "cliente.editar": "Edición de cliente",
  "cliente.eliminar": "Baja de cliente",
  "deudor.crear": "Alta de deudor",
  "deudor.editar": "Edición de deudor",
};

export type OperacionDescrita = {
  id: string;
  titulo: string;
  /** Quién: nombre del cliente o deudor, si se conoce. */
  detalle: string | null;
  estado: WriteQueueItem["status"];
  motivo: string | null;
  creadaEn: string;
};

export async function describirOperacion(op: WriteQueueItem): Promise<OperacionDescrita> {
  const p = op.payload;
  let titulo = VERBO[op.type] ?? op.type;
  if (typeof p.numeroCuota === "number") titulo += ` ${p.numeroCuota}`;
  if (typeof p.monto === "number") titulo += ` · ${formatMoneda(p.monto)}`;
  return {
    id: op.id,
    titulo,
    detalle: await nombreRelacionado(p),
    estado: op.status,
    motivo: op.status === "conflict" ? op.lastError ?? null : null,
    creadaEn: op.createdAt,
  };
}

async function nombreRelacionado(p: Record<string, unknown>): Promise<string | null> {
  if (typeof p.clienteNombre === "string") return p.clienteNombre;
  if (typeof p.nombre === "string") return p.nombre;
  if (!db) return null;
  if (typeof p.clienteId === "string") {
    const c = await db.clientes.get(p.clienteId);
    if (c) return c.nombre;
  }
  if (typeof p.contrataId === "string") {
    const c = await db.contratas.get(p.contrataId);
    if (c) return c.clienteNombre;
  }
  if (typeof p.deudorId === "string") {
    const d = await db.deudores.get(p.deudorId);
    if (d) return d.nombre;
  }
  if (typeof p.citaId === "string") {
    const c = await db.citas.get(p.citaId);
    if (c) return c.clienteNombre;
  }
  return null;
}
