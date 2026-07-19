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

    function registrar() {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[PWA] No se pudo registrar el service worker:", err);
      });
    }

    // Se registra en `load` (no directo en el efecto): es la recomendación
    // estándar (evita competir con el render inicial) y de paso es más
    // resiliente en navegadores/PWAs que difieren la ejecución de JS de
    // pestañas en segundo plano o recién abiertas antes de `load`.
    if (document.readyState === "complete") {
      registrar();
    } else {
      window.addEventListener("load", registrar, { once: true });
      return () => window.removeEventListener("load", registrar);
    }
  }, []);

  return null;
}
