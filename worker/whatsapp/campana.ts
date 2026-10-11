import { prisma } from "@/lib/prisma";

/** Días distintos en que la campaña ya envió presentaciones (para la rampa y el freno). */
export async function diasConEnvioDeCampana(campanaId: string): Promise<number> {
  const filas = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT date_trunc('day', e."enviadoEn" AT TIME ZONE 'America/Mexico_City'))::bigint AS n
    FROM "MensajeWhatsApp" m JOIN "EnvioWhatsApp" e ON e.id = m."envioId"
    WHERE m."campanaId" = ${campanaId} AND m.estado = 'ENVIADO'`;
  return Number(filas[0]?.n ?? 0);
}

/** Presentaciones de la campaña enviadas hoy. */
export async function presentacionesHoy(campanaId: string, desde: Date): Promise<number> {
  return prisma.mensajeWhatsApp.count({
    where: { campanaId, estado: "ENVIADO", envio: { enviadoEn: { gte: desde } } },
  });
}
