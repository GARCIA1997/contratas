import type { Rango } from "@/lib/monitor/datos";

export function rangoDeParams(sp: { rango?: string }): Rango {
  return sp.rango === "7d" || sp.rango === "30d" ? sp.rango : "hoy";
}

export const ETIQUETA_RANGO: Record<Rango, string> = {
  hoy: "hoy",
  "7d": "últimos 7 días",
  "30d": "últimos 30 días",
};
