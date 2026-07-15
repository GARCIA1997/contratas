"use client";

import { useEffect } from "react";
import { syncAll } from "@/lib/offline/sync";
import { flushQueue } from "@/lib/offline/queue";

/**
 * Monta el ciclo de vida de la capa offline para el owner activo: sync
 * inicial si hay red, y sync + flush de la cola cada vez que el navegador
 * recupera conexión.
 */
export function OfflineBootstrap({ ownerId }: { ownerId: string }) {
  useEffect(() => {
    void syncAll(ownerId);
    void flushQueue(ownerId);

    function onOnline() {
      void syncAll(ownerId);
      void flushQueue(ownerId);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [ownerId]);

  return null;
}
