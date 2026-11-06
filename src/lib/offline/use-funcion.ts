"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline/db";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import type { ClaveFuncion } from "@/lib/funciones";

/**
 * ¿Está encendida esta función en prueba para el espacio del usuario? Se lee
 * de la configuración guardada en el teléfono, así que funciona sin señal y
 * se actualiza en el siguiente sync. Mientras no se sepa, se asume apagada:
 * la app se ve como antes.
 */
export function useFuncion(clave: ClaveFuncion): boolean {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const config = useLiveQuery(
    () => (ownerId && db ? db.configuracion.get(ownerId) : undefined),
    [ownerId]
  );
  return Boolean(config?.funciones?.includes(clave));
}
