"use client";

import { useEffect } from "react";
import { syncAll } from "@/lib/offline/sync";
import { flushQueue } from "@/lib/offline/queue";
import { suscribirseAConexion } from "@/lib/offline/conexion";

/**
 * Monta el ciclo de vida de la capa offline para el owner activo.
 *
 * Ambas llamadas deciden solas si les toca correr según la calidad de la
 * conexión (ver `conexion.ts`): el pull-sync se abstiene en red lenta —son
 * ~1 MB en cinco peticiones—, mientras que la cola de escrituras sí se
 * vacía siempre que haya algo de red, porque son cobros y abonos que el
 * usuario ya dio por hechos.
 *
 * Se escucha el cambio de conexión completo, no solo `online`/`offline`:
 * pasar de 3G a wifi no dispara ningún evento `online` (nunca se estuvo
 * sin red), así que antes la app se quedaba en modo ahorro hasta la
 * siguiente navegación.
 */
export function OfflineBootstrap({ ownerId }: { ownerId: string }) {
  useEffect(() => {
    function intentar() {
      void syncAll(ownerId);
      void flushQueue(ownerId);
    }
    intentar();
    return suscribirseAConexion(intentar);
  }, [ownerId]);

  return null;
}
