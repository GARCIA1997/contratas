import type { Configuracion, ModoQuincenal } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const CONFIG_DEFAULTS = {
  nombreApp: "Kredired",
  tasaSemanal: 125,
  tasaQuincenal: 135,
  tasaMensual: 200,
  cuotasPorDefecto: 10,
  maxCuotas: 52,
  modoFechasQuincenal: "QUINCE_DIAS" as ModoQuincenal,
  diaCobroSemanal: 1,
  colorPrimario: "#0F7BFF",
  logoUrl: "/icons/kredired.png" as string | null,
};

export type ConfigView = typeof CONFIG_DEFAULTS;

function toView(cfg: Configuracion): ConfigView {
  return {
    nombreApp: cfg.nombreApp,
    tasaSemanal: cfg.tasaSemanal,
    tasaQuincenal: cfg.tasaQuincenal,
    tasaMensual: cfg.tasaMensual,
    cuotasPorDefecto: cfg.cuotasPorDefecto,
    maxCuotas: cfg.maxCuotas,
    modoFechasQuincenal: cfg.modoFechasQuincenal,
    diaCobroSemanal: cfg.diaCobroSemanal,
    colorPrimario: cfg.colorPrimario,
    logoUrl: cfg.logoUrl,
  };
}

/**
 * Configuración del usuario (get-or-create). Cada usuario tiene su propia
 * configuración aislada. Si la DB no está disponible, cae a valores por defecto.
 */
export async function getConfig(ownerId: string): Promise<ConfigView> {
  try {
    const cfg = await prisma.configuracion.upsert({
      where: { ownerId },
      update: {},
      create: { ownerId },
    });
    return toView(cfg);
  } catch {
    return CONFIG_DEFAULTS;
  }
}
