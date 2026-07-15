import { db } from "@/lib/offline/db";

/**
 * Offline-first no es multi-usuario-concurrente en el mismo dispositivo: si
 * detectamos que el usuario autenticado cambió respecto al que tiene datos
 * cacheados, purgamos todo antes de hidratar al nuevo — nunca mezclar datos
 * de dos owners en el mismo IndexedDB.
 */
export async function onAuthChange(userId: string | null): Promise<void> {
  const database = db;
  if (!database) return;

  const current = (await database.meta.get("currentOwnerId"))?.value as
    | string
    | undefined;

  if (userId === current) return;

  if (current) {
    await database.transaction(
      "rw",
      [
        database.clientes,
        database.contratas,
        database.pagos,
        database.deudores,
        database.abonosDeudor,
        database.configuracion,
        database.writeQueue,
      ],
      async () => {
        await Promise.all([
          database.clientes.clear(),
          database.contratas.clear(),
          database.pagos.clear(),
          database.deudores.clear(),
          database.abonosDeudor.clear(),
          database.configuracion.clear(),
          database.writeQueue.clear(),
        ]);
      }
    );
  }

  if (userId) {
    await database.meta.put({ key: "currentOwnerId", value: userId });
  } else {
    await database.meta.delete("currentOwnerId");
  }
}
