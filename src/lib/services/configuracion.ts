import { prisma } from "@/lib/prisma";
import type { ConfigInput } from "@/lib/validaciones";

/** Actualiza (o crea) la configuración del usuario. */
export async function updateConfig(ownerId: string, input: ConfigInput) {
  const logoUrl =
    input.logoUrl && input.logoUrl.length > 0 ? input.logoUrl : null;

  const data = {
    nombreApp: input.nombreApp,
    tasaSemanal: input.tasaSemanal,
    tasaQuincenal: input.tasaQuincenal,
    cuotasPorDefecto: input.cuotasPorDefecto,
    maxCuotas: input.maxCuotas,
    modoFechasQuincenal: input.modoFechasQuincenal,
    colorPrimario: input.colorPrimario,
    logoUrl,
  };

  return prisma.configuracion.upsert({
    where: { ownerId },
    update: data,
    create: { ownerId, ...data },
  });
}
