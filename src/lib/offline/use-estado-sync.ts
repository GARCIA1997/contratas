"use client";

import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline/db";
import { claveUltimoSync } from "@/lib/offline/sync";
import {
  calidadConexion,
  suscribirseAConexion,
  type CalidadConexion,
} from "@/lib/offline/conexion";
import { modoLocalActivo, suscribirseAModoLocal } from "@/lib/offline/modo-local";
import { estadoEnvio, suscribirseAEnvio, type EstadoEnvio } from "@/lib/offline/cola/estado";

/**
 * Todo lo que el control de sincronización necesita saber, en un solo
 * lugar y reactivo: conexión, modo local, envío en curso, cola y antigüedad
 * de los datos. Las fuentes son independientes (localStorage, navigator,
 * memoria, IndexedDB); aquí se juntan para que la UI no tenga que conocer
 * ninguna.
 */
export type EstadoSync = {
  modoLocal: boolean;
  calidad: CalidadConexion;
  envio: EstadoEnvio;
  /** Operaciones en cola que se subirán solas (sin contar conflictos). */
  pendientes: number;
  /** Apartadas por el servidor: necesitan que alguien las revise. */
  conflictos: number;
  /** Epoch ms del último sync completo exitoso (null: nunca en este teléfono). */
  ultimoSync: number | null;
};

const calidadServidor = (): CalidadConexion => "rapida";

export function useEstadoSync(ownerId: string): EstadoSync {
  const modoLocal = useSyncExternalStore(suscribirseAModoLocal, modoLocalActivo, () => false);
  const calidad = useSyncExternalStore(suscribirseAConexion, calidadConexion, calidadServidor);
  const envio = useSyncExternalStore(suscribirseAEnvio, estadoEnvio, estadoEnvio);

  const cola =
    useLiveQuery(async () => {
      if (!db) return { pendientes: 0, conflictos: 0 };
      const ops = await db.writeQueue.where("ownerId").equals(ownerId).toArray();
      const conflictos = ops.filter((op) => op.status === "conflict").length;
      return { pendientes: ops.length - conflictos, conflictos };
    }, [ownerId]) ?? { pendientes: 0, conflictos: 0 };

  const ultimoSync =
    useLiveQuery(
      async () => ((await db?.meta.get(claveUltimoSync(ownerId)))?.value as number | undefined) ?? null,
      [ownerId]
    ) ?? null;

  return { modoLocal, calidad, envio, ...cola, ultimoSync };
}
