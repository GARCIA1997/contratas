"use client";

import { useEffect } from "react";
import { enlaceParaApp, esAndroid, leerAppWhatsApp } from "@/lib/whatsapp-app";

/**
 * Hace que los enlaces de WhatsApp de toda la app abran la app elegida en
 * Configuración (solo Android). Sin preferencia no toca nada: el enlace se
 * abre exactamente como siempre.
 */
export function AbrirEnAppElegida() {
  useEffect(() => {
    if (!esAndroid(navigator.userAgent)) return;
    function alTocar(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.(
        "a[href^='whatsapp://'], a[data-wa-original]"
      ) as HTMLAnchorElement | null;
      if (!a) return;
      // Se guarda el enlace original: si después cambia la preferencia, se
      // vuelve a calcular desde él y no desde el ya convertido.
      const original = a.dataset.waOriginal ?? a.getAttribute("href") ?? "";
      a.dataset.waOriginal = original;
      a.setAttribute("href", enlaceParaApp(original, leerAppWhatsApp()));
    }
    document.addEventListener("click", alTocar, true);
    return () => document.removeEventListener("click", alTocar, true);
  }, []);
  return null;
}
