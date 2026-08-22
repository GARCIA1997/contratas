"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getConfiguracion } from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

export type MarcaRecibo = {
  nombreApp: string;
  logoUrl: string | null;
  colorPrimario: string;
  /** Quién está operando la app — se imprime como "Atendido por …". */
  hechoPor: string | null;
};

/**
 * Identidad de marca para los recibos, leída del espejo offline (Dexie) en
 * vez de un fetch: así el recibo se ve igual con o sin conexión, que es
 * justo cuando se usa en campo.
 */
export function useMarcaRecibo(): MarcaRecibo {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  return {
    nombreApp: config?.nombreApp ?? CONFIG_DEFAULTS.nombreApp,
    logoUrl: config?.logoUrl ?? CONFIG_DEFAULTS.logoUrl,
    colorPrimario: config?.colorPrimario ?? CONFIG_DEFAULTS.colorPrimario,
    hechoPor: claims.ready ? claims.nombre : null,
  };
}
