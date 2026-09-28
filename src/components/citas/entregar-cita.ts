import { enqueue } from "@/lib/offline/queue";
import { syncCitas } from "@/lib/offline/sync";

/**
 * Cierra el círculo al convertir una cita agendada en contrata real: marca
 * la cita como entregada y la enlaza con la contrata nueva. Best-effort — si
 * falla, la cita queda pendiente y se puede descartar/reagendar a mano; no
 * bloquea ni afecta la contrata ya creada (esta llamada es siempre posterior
 * a que la contrata real se haya guardado con éxito).
 */
export async function entregarCita(
  ownerId: string,
  citaId: string,
  info: { contrataId: string | null; offline: boolean }
): Promise<void> {
  if (info.offline) {
    // Si ya no cabe en la cola (límite de movimientos sin sincronizar), la
    // cita queda pendiente y se marca a mano después — la contrata ya se
    // guardó y no debe verse afectada.
    // En modo local la contrata ya nace con su id definitivo (ver
    // entrega-local.ts) y su alta va antes en la cola, así que el enlace
    // cita → contrata se puede mandar desde ya.
    await enqueue(ownerId, "cita.entregar", {
      citaId,
      contrataCreadaId: info.contrataId,
    }).catch(() => undefined);
    return;
  }
  try {
    await fetch(`/api/citas/${citaId}/entregar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrataCreadaId: info.contrataId }),
    });
    await syncCitas(ownerId);
  } catch {
    // Sin red pese a `!info.offline` (se perdió justo en ese instante): la
    // cita simplemente queda pendiente, se resuelve a mano después.
  }
}
