"use client";

import { useEffect, useState } from "react";
import { cerrarDialogo, suscribirDialogo, type Dialogo } from "@/lib/dialogo";

/** Igual que DialogoGlobal pero con el tema del monitor (se monta dentro de #monitor). */
export function DialogoMonitor() {
  const [d, setD] = useState<Dialogo | null>(null);
  useEffect(() => suscribirDialogo(setD), []);
  useEffect(() => {
    if (!d) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrarDialogo(d.id, d.tipo === "aviso");
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [d]);
  if (!d) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && cerrarDialogo(d.id, d.tipo === "aviso")}
    >
      <div role="alertdialog" className="w-full max-w-md rounded-2xl bg-surface-container-low p-space-lg shadow-2xl">
        <p className="whitespace-pre-line font-body-md text-body-md text-on-surface">{d.mensaje}</p>
        <div className="mt-space-md flex justify-end gap-2">
          {d.tipo === "confirmacion" && (
            <button
              type="button"
              onClick={() => cerrarDialogo(d.id, false)}
              className="rounded-lg bg-surface-container px-3 py-1.5 font-label-sm text-label-sm text-on-surface hover:bg-surface-container-high"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => cerrarDialogo(d.id, true)}
            className={`rounded-lg px-3 py-1.5 font-label-sm text-label-sm ${
              d.peligro ? "bg-error-container text-on-error-container" : "bg-primary text-on-primary"
            }`}
          >
            {d.aceptar}
          </button>
        </div>
      </div>
    </div>
  );
}
