"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Modal centrado tipo alerta nativa (fondo oscurecido + tarjeta), para
 * decisiones puntuales con 1-2 botones — no un Dialog de propósito general
 * (sin focus trap ni portal): alcanza para este caso y evita sumar una
 * dependencia (Radix Dialog) por un solo uso.
 */
export function Popup({
  open,
  onClose,
  children,
  className,
  capa = "z-50",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Capa (z-index). Los diálogos de confirmación van por encima de otras ventanas. */
  capa?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn("fixed inset-0 flex items-center justify-center bg-black/50 p-4", capa)}
      onClick={onClose}
    >
      <div
        className={cn(
          // Nunca más alta que la pantalla: si el contenido no cabe, se
          // desliza dentro de la tarjeta en vez de cortarse arriba y abajo.
          "max-h-[calc(100dvh-2rem)] w-full max-w-xs overflow-y-auto overscroll-contain rounded-3xl border border-border/60 bg-card p-5 text-center shadow-2xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
