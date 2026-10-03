"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncAll } from "@/lib/offline/sync";
import { flushQueue } from "@/lib/offline/queue";
import { suscribirseAConexion } from "@/lib/offline/conexion";
import { instalarGuardiaFetch } from "@/lib/offline/modo-local";
import { asegurarIndexedDB, vigilarIndexedDB } from "@/lib/offline/dexie-retry";
import { descargarPantallasEnSegundoPlano } from "@/lib/offline/pantallas-offline";

/**
 * Monta el ciclo de vida de la capa offline para el owner activo.
 *
 * Ambas llamadas deciden solas si les toca correr según la calidad de la
 * conexión (ver `conexion.ts`): el pull-sync se abstiene en red lenta,
 * mientras que la cola de escrituras sí se vacía siempre que haya algo de
 * red, porque son cobros y abonos que el usuario ya dio por hechos. La cola
 * va primero: así lo que se baja ya incluye lo que se acaba de subir.
 *
 * Se dispara:
 * - al montar;
 * - con cualquier cambio de conexión (no solo `online`/`offline`: pasar de
 *   3G a wifi no dispara `online`) o del switch de modo local;
 * - al volver la app al frente. En segundo plano el navegador congela
 *   timers y peticiones (iOS sobre todo): al regresar, la señal pudo haber
 *   vuelto sin que llegara ningún evento, y un envío pudo haberse quedado a
 *   medias — el candado de la cola lo detecta y lo retoma.
 *
 * Con buena señal, además, deja descargadas en segundo plano las pantallas
 * de la app (una vez por versión) para que abran aunque se pierda la señal
 * sin haber preparado nada — ver pantallas-offline.ts.
 */
export function OfflineBootstrap({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  useEffect(() => {
    instalarGuardiaFetch();
    const dejarDeVigilar = vigilarIndexedDB();
    async function intentar() {
      // Primero la conexión local: al volver del segundo plano en iPhone
      // suele estar muerta (ver dexie-retry.ts) y la cola y el sync son lo
      // primero que la usan.
      await asegurarIndexedDB();
      await flushQueue(ownerId);
      await syncAll(ownerId);
      descargarPantallasEnSegundoPlano(router);
    }
    void intentar();
    const quitarConexion = suscribirseAConexion(() => void intentar());
    const quitarFrente = suscribirseAVolverAlFrente(() => void intentar());
    return () => {
      dejarDeVigilar();
      quitarConexion();
      quitarFrente();
    };
  }, [ownerId, router]);

  return null;
}

/** La app regresó de segundo plano (cambio de pestaña/app, pantalla apagada, bfcache). */
function suscribirseAVolverAlFrente(cb: () => void): () => void {
  const alCambiarVisibilidad = () => {
    if (document.visibilityState === "visible") cb();
  };
  const alMostrarPagina = (e: PageTransitionEvent) => {
    if (e.persisted) cb();
  };
  document.addEventListener("visibilitychange", alCambiarVisibilidad);
  window.addEventListener("pageshow", alMostrarPagina);
  return () => {
    document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    window.removeEventListener("pageshow", alMostrarPagina);
  };
}
