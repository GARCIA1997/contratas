import { db, type QueueOpType } from "@/lib/offline/db";
import {
  syncCitas,
  syncClientes,
  syncContratas,
  syncDeudorDetalle,
  syncDeudores,
} from "@/lib/offline/sync";
import type { OperacionCola } from "@/lib/offline/cola/peticiones";
import { liberarSiSinPendientes } from "@/lib/offline/cola/entidades";

/**
 * Qué hay que volver a traer del servidor cuando se confirma cada tipo de
 * operación. El efecto optimista es deliberadamente simple (no recalcula
 * calendarios, no sabe a qué deudor se sumó un saldo…), así que tras
 * confirmarse se refresca esa porción con el resultado real.
 */
const REFRESCOS: Partial<Record<QueueOpType, (ownerId: string, p: Record<string, unknown>) => Promise<unknown>>> = {
  "contrata.marcarDeuda": (o) => Promise.all([syncContratas(o), syncDeudores(o)]),
  "contrata.crear": (o) => Promise.all([syncContratas(o), syncClientes(o)]),
  "contrata.editar": (o) => syncContratas(o),
  "contrata.renovar": (o) => syncContratas(o),
  "cliente.unificar": (o) => syncContratas(o),
  "cliente.cobrarVencidas": (o) => syncContratas(o),
  "cliente.abonarParcial": (o) => syncContratas(o),
  "deudor.abonar": (o, p) => syncDeudorDetalle(o, p.deudorId as string),
  "cliente.crear": (o) => syncClientes(o),
  "cliente.editar": (o) => syncClientes(o),
  "cliente.eliminar": (o) => syncClientes(o),
  "deudor.crear": (o) => syncDeudores(o),
  "deudor.editar": (o) => syncDeudores(o),
  "cita.crear": (o) => syncCitas(o),
  "cita.editar": (o) => syncCitas(o),
  "cita.cancelar": (o) => syncCitas(o),
  "cita.entregar": (o) => syncCitas(o),
};

/** Tras confirmarse: libera los registros y trae la versión del servidor. */
export async function reconciliarTrasExito(ownerId: string, op: OperacionCola): Promise<void> {
  if (op.type === "cliente.eliminar" && db) {
    // Ya no existe en el servidor: se saca de la caché (liberarlo lo haría
    // reaparecer en las listas hasta el siguiente sync).
    await db.clientes.delete(op.payload.clienteId as string);
  }
  await liberarSiSinPendientes(op);
  await REFRESCOS[op.type]?.(ownerId, op.payload);
}

type FilasLocales = {
  contrata: { id: string };
  clienteNuevo?: { id: string } | null;
};

/**
 * Una operación que no se va a aplicar (rechazada por el servidor, apartada
 * por depender de una rechazada, o descartada a mano) deja de mostrarse
 * como hecha: se quita lo que su efecto creó en el teléfono y se liberan
 * los registros que tocó para que el siguiente sync traiga el estado real.
 */
export async function deshacerEfectoLocal(op: OperacionCola): Promise<void> {
  const database = db;
  if (!database) return;

  if (op.type === "cita.crear" && op.payload.id) {
    await database.citas.delete(op.payload.id as string);
  }

  const filas = op.payload._local as FilasLocales | undefined;
  if (filas) {
    const pagos = await database.pagos.where("contrataId").equals(filas.contrata.id).primaryKeys();
    await database.pagos.bulkDelete(pagos);
    await database.contratas.delete(filas.contrata.id);
    if (filas.clienteNuevo) await database.clientes.delete(filas.clienteNuevo.id);
  }

  await liberarSiSinPendientes(op);
}

/**
 * Tras deshacer uno o más efectos locales: una sola descarga de lo que
 * pudieron tocar (no una por operación — con varias apartadas en la misma
 * pasada serían decenas de peticiones en una red que ya es mala).
 */
export async function refrescarTrasDeshacer(ownerId: string): Promise<void> {
  await Promise.all([
    syncContratas(ownerId),
    syncClientes(ownerId),
    syncCitas(ownerId),
    syncDeudores(ownerId),
  ]).catch(() => undefined);
}
