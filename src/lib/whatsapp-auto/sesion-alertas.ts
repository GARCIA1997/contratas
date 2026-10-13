import { prisma } from "@/lib/prisma";

/** Reconexiones en una hora a partir de las cuales se avisa (algo anda mal aunque vuelva solo). */
export const RECONEXIONES_ALERTA = 5;

export type SesionCerrada = { id: string; cuentaId: string; motivo: string | null; creadoEn: Date };

/**
 * Lo que el monitor y el push comparten sobre la salud de la sesión:
 *  - `cerradas`: WhatsApp cerró la sesión (401/device_removed, conexión
 *    reemplazada) en las últimas 24 h y la cuenta sigue sin conectarse;
 *  - `reconexiones`: cierres de conexión de la última hora por cuenta;
 *  - `sinEntregar`: mensajes que WhatsApp rechazó o no confirmó en la última hora.
 */
export async function eventosDeSesion(ahora = new Date()) {
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60_000);
  const haceUnaHora = new Date(ahora.getTime() - 60 * 60_000);
  const [filas, cierres, sinConexion, noEntregados] = await Promise.all([
    prisma.bitacoraWhatsApp.findMany({
      where: { tipo: "sesion_cerrada_por_whatsapp", creadoEn: { gte: hace24h } },
      orderBy: { creadoEn: "desc" },
      select: { id: true, cuentaId: true, detalle: true, creadoEn: true },
    }),
    prisma.bitacoraWhatsApp.groupBy({
      by: ["cuentaId"],
      where: { tipo: "desconectado", creadoEn: { gte: haceUnaHora }, cuentaId: { not: null } },
      _count: { _all: true },
    }),
    prisma.cuentaWhatsApp.findMany({ where: { estado: { not: "CONECTADO" } }, select: { id: true } }),
    // Rechazados por WhatsApp o sin acuse en la última hora (siguen sin resolverse).
    prisma.mensajeWhatsApp.groupBy({
      by: ["cuentaId"],
      where: {
        actualizadoEn: { gte: haceUnaHora },
        OR: [
          { estado: "FALLIDO", motivo: { startsWith: "WhatsApp rechazó" } },
          { estado: "REVISAR", motivo: { startsWith: "WhatsApp no confirmó" } },
        ],
      },
      _count: { _all: true },
    }),
  ]);
  const sinConexionIds = new Set(sinConexion.map((c) => c.id));
  const cerradas: SesionCerrada[] = [];
  const vistas = new Set<string>();
  for (const f of filas) {
    if (!f.cuentaId || !sinConexionIds.has(f.cuentaId) || vistas.has(f.cuentaId)) continue; // solo la más reciente por cuenta
    vistas.add(f.cuentaId);
    const motivo = (f.detalle as { motivo?: string | null } | null)?.motivo ?? null;
    cerradas.push({ id: f.id, cuentaId: f.cuentaId, motivo, creadoEn: f.creadoEn });
  }
  const reconexiones = new Map<string, number>();
  for (const c of cierres) if (c.cuentaId) reconexiones.set(c.cuentaId, c._count._all);
  const sinEntregar = new Map<string, number>();
  for (const c of noEntregados) sinEntregar.set(c.cuentaId, c._count._all);
  return { cerradas, reconexiones, sinEntregar };
}
