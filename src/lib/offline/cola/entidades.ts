import { db, type WriteQueueItem } from "@/lib/offline/db";
import type { OperacionCola } from "@/lib/offline/cola/peticiones";

/**
 * Qué registros toca cada operación de la cola.
 *
 * Una sola respuesta para dos preguntas que antes se contestaban por
 * separado (y de forma incompleta) en cada tipo de operación:
 *
 * 1. ¿Qué operaciones posteriores dependen de una que el servidor rechazó?
 *    (ver `flushQueue`: se apartan para no aplicarlas fuera de contexto).
 * 2. ¿Se puede liberar ya un registro de `_dirty`, o todavía hay algo en
 *    cola que lo modifica? Liberarlo antes deja que el pull-sync lo pise
 *    con el estado viejo del servidor — p. ej. cuotas que se ven "sin
 *    pagar" cuando ya se cobraron, y se vuelven a cobrar.
 */

/** Operaciones que actúan sobre TODAS las contratas activas de un cliente. */
const OPERACIONES_DE_CLIENTE = new Set(["cliente.cobrarVencidas", "cliente.abonarParcial"]);

/** Ids que aparecen en la operación (lo que modifica y lo que referencia). */
export function entidadesDe(payload: Record<string, unknown>): string[] {
  const input = payload.input as Record<string, unknown> | undefined;
  const local = payload._local as
    | {
        contrata?: { id: string; clienteId?: string };
        liquidar?: { contrataId: string }[];
      }
    | undefined;
  const ids: unknown[] = [
    payload.contrataId,
    payload.clienteId,
    payload.clienteNuevoId,
    payload.deudorId,
    payload.citaId,
    payload.id,
    payload.contrataCreadaId,
    input?.id,
    ...((payload.contrataIds as unknown[]) ?? []),
    ...((payload.otrasIds as unknown[]) ?? []),
    local?.contrata?.id,
    local?.contrata?.clienteId,
    ...(local?.liquidar ?? []).map((l) => l.contrataId),
  ];
  return Array.from(new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0)));
}

/**
 * Como `entidadesDe`, pero expande las operaciones "de cliente" (cobrar lo
 * vencido, abono parcial) a cada una de sus contratas: su efecto local
 * marca cuotas de todas ellas.
 */
async function entidadesAfectadas(op: OperacionCola): Promise<string[]> {
  const ids = entidadesDe(op.payload);
  if (!db || !OPERACIONES_DE_CLIENTE.has(op.type)) return ids;
  const contratas = await db.contratas
    .where("clienteId")
    .equals(op.payload.clienteId as string)
    .primaryKeys();
  return [...ids, ...contratas];
}

/** Todo lo que siguen tocando las operaciones vivas (no en conflicto) de la cola. */
async function entidadesConPendientes(): Promise<Set<string>> {
  if (!db) return new Set();
  const vivas: WriteQueueItem[] = await db.writeQueue
    .filter((op) => op.status !== "conflict")
    .toArray();
  const listas = await Promise.all(vivas.map(entidadesAfectadas));
  return new Set(listas.flat());
}

/**
 * Quita `_dirty` de los registros que tocó `op`, salvo los que todavía
 * tengan otra operación viva en cola. Se llama tras confirmarse, descartarse
 * o apartarse una operación; a partir de ahí el pull-sync ya puede traer la
 * versión del servidor.
 */
export async function liberarSiSinPendientes(op: OperacionCola): Promise<void> {
  const database = db;
  if (!database) return;
  const [propias, ocupadas] = await Promise.all([
    entidadesAfectadas(op),
    entidadesConPendientes(),
  ]);
  const libres = propias.filter((id) => !ocupadas.has(id));
  if (libres.length === 0) return;
  await database.transaction(
    "rw",
    [database.contratas, database.clientes, database.deudores, database.citas],
    async () => {
      await database.contratas.where("id").anyOf(libres).modify({ _dirty: false });
      await database.clientes.where("id").anyOf(libres).modify({ _dirty: false });
      await database.deudores.where("id").anyOf(libres).modify({ _dirty: false });
      await database.citas.where("id").anyOf(libres).modify({ _dirty: false });
    }
  );
}
