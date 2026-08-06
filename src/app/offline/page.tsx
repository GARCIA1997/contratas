"use client";

import Link from "next/link";
import { RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="size-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">Sin conexión</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        No hay conexión a internet. Las páginas que ya visitaste siguen
        disponibles; el resto se cargará al recuperar la señal.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <Button asChild>
          {/* "/" (Inicio) es de las páginas más visitadas — casi siempre
              está en cache, y desde ahí el nav normal de la app sigue
              funcionando para llegar a cualquier otra pantalla ya
              guardada. */}
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RotateCw className="size-4" /> Reintentar
        </Button>
      </div>
    </div>
  );
}
