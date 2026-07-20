"use client";

import { forwardRef, type ComponentProps } from "react";
import Link from "next/link";
import { emitOfflineBlocked } from "@/lib/offline/offline-toast";

/**
 * Reemplazo directo de `next/link` para páginas que siguen siendo Server
 * Component (sin datos offline en Dexie): si se toca sin conexión, el
 * fetch RSC de Next.js falla en silencio y deja la pantalla en blanco (ver
 * PLAN de migración a Serwist). Esto lo evita bloqueando la navegación y
 * avisando, en vez de dejar que falle.
 */
export const OfflineAwareLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof Link>
>(function OfflineAwareLink({ onClick, ...props }, ref) {
  return (
    <Link
      {...props}
      ref={ref}
      onClick={(e) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          e.preventDefault();
          emitOfflineBlocked();
          return;
        }
        onClick?.(e);
      }}
    />
  );
});
