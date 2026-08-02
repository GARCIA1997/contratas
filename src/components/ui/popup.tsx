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
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-xs rounded-3xl border border-border/60 bg-card p-5 text-center shadow-2xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
