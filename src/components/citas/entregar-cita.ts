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
    // Sin señal el formulario ya encoló `cita.entregar` en el MISMO lote que
    // la contrata (recibe `citaId`): o entraron las dos o ninguna. Antes se
    // encolaba aquí aparte y, si ya no cabía, se perdía en silencio — la
    // cita seguía pendiente y volver a entregarla creaba otra contrata.
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
