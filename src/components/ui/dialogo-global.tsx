"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popup } from "@/components/ui/popup";
import { cerrarDialogo, suscribirDialogo, type Dialogo } from "@/lib/dialogo";

/** Pinta las alertas y confirmaciones de `lib/dialogo.ts` con el estilo de la app. */
export function DialogoGlobal() {
  const [d, setD] = useState<Dialogo | null>(null);
  useEffect(() => suscribirDialogo(setD), []);
  if (!d) return null;
  const cancelar = () => cerrarDialogo(d.id, false);
  return (
    <Popup open onClose={d.tipo === "aviso" ? () => cerrarDialogo(d.id, true) : cancelar}>
      <p role="alertdialog" className="whitespace-pre-line text-sm">
        {d.mensaje}
      </p>
      <div className="flex flex-col gap-2 pt-4">
        <Button
          autoFocus
          variant={d.peligro ? "destructive" : "default"}
          onClick={() => cerrarDialogo(d.id, true)}
        >
          {d.aceptar}
        </Button>
        {d.tipo === "confirmacion" && (
          <Button variant="ghost" onClick={cancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </Popup>
  );
}
