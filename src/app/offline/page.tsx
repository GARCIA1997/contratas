"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  // "Ir al inicio" original usaba <Link> (fetch del RSC payload de "/") —
  // si de verdad no hay red y "/" nunca se cacheó, esa petición falla en
  // silencio: el clic no hacía nada visible. "Volver" en cambio regresa a
  // la página de la que se vino, que por definición YA cargó hace un
  // instante — no depende de ninguna petición nueva. Solo se muestra si
  // hay a dónde volver (primera carga directa en /offline no tiene).
  const [hayHistorial, setHayHistorial] = useState(false);
  useEffect(() => {
    setHayHistorial(window.history.length > 1);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="size-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">Sin conexión</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        No hay conexión a internet. Las páginas que ya visitaste siguen
        disponibles; el resto se cargará al recuperar la señal.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {hayHistorial && (
          <Button onClick={() => window.history.back()}>
            <ArrowLeft className="size-4" /> Volver
          </Button>
        )}
        <Button
          variant={hayHistorial ? "outline" : "default"}
          onClick={() => window.location.reload()}
        >
          <RotateCw className="size-4" /> Reintentar
        </Button>
      </div>
    </div>
  );
}
