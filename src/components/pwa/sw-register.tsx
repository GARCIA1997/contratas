"use client";

import { useEffect } from "react";

/**
 * next-pwa (App Router) no inyecta el script de registro automáticamente
 * como sí lo hace en Pages Router — hay que registrarlo a mano. Sin esto
 * el service worker nunca se activa: ni el caché de assets, ni la página
 * /offline de fallback, ni la capa de datos offline (que depende de que
 * la app misma cargue) funcionan de verdad.
 */
export function SwRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[PWA] No se pudo registrar el service worker:", err);
    });
  }, []);

  return null;
}
