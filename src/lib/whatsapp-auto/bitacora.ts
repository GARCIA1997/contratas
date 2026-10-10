import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Todo lo que pasa con WhatsApp queda aquí (sección Bitácora del monitor). */
export async function registrarBitacora(evento: {
  cuentaId?: string | null;
  tipo: string;
  detalle?: Prisma.InputJsonValue;
  actor?: string | null;
}) {
  await prisma.bitacoraWhatsApp
    .create({
      data: {
        cuentaId: evento.cuentaId ?? null,
        tipo: evento.tipo,
        detalle: evento.detalle ?? undefined,
        actor: evento.actor ?? null,
      },
    })
    .catch(() => undefined);
}
