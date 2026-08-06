"use client";

import { useEffect } from "react";

/**
 * Cancela el watchdog de arranque (ver src/lib/boot-watchdog.ts): confirma
 * que React sí montó, para que el fallback de "no se pudo cargar" nunca se
 * dispare en un arranque normal — solo cuando de verdad se queda en blanco.
 */
export function BootWatchdogMarker() {
  useEffect(() => {
    document.documentElement.setAttribute("data-app-mounted", "true");
  }, []);
  return null;
}
