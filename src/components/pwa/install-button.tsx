"use client";

import { useEffect, useState } from "react";
import { Download, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  esAndroid,
  estadoInstalador,
  instalarApp,
  suscribirseAInstalador,
} from "@/lib/pwa/instalador";

/**
 * Respaldo manual en Configuración: vive aquí para el caso en que el aviso
 * automático (`InstalarAndroidBanner`) no aplica — ya se descartó, el
 * navegador no ofreció el instalador nativo, o no es Android. Comparte el
 * mismo estado que el banner (ver `lib/pwa/instalador.ts`) en vez de poner
 * su propio listener de `beforeinstallprompt`.
 */
export function InstallButton() {
  const [estado, setEstado] = useState(estadoInstalador());
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setEstado(estadoInstalador());
    return suscribirseAInstalador(() => setEstado(estadoInstalador()));
  }, []);

  async function instalar() {
    setOcupado(true);
    try {
      await instalarApp();
      setEstado(estadoInstalador());
    } finally {
      setOcupado(false);
    }
  }

  if (estado.instalada) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        La app está instalada en este dispositivo.
      </p>
    );
  }

  if (estado.instalable) {
    return (
      <Button variant="outline" className="w-full" disabled={ocupado} onClick={instalar}>
        <Download className="size-4" /> {ocupado ? "Instalando…" : "Instalar aplicación"}
      </Button>
    );
  }

  // El navegador nunca ofreció el evento nativo — o ya se usó. En Android
  // esto normalmente significa que Chrome no considera el momento oportuno
  // (a veces exige un poco de uso previo del sitio), así que en vez de un
  // botón que no haría nada, se dan los pasos manuales concretos: son
  // siempre los mismos dos, y evitan una llamada de soporte.
  if (esAndroid()) {
    return (
      <div className="rounded-2xl border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
        <p className="mb-1.5 font-medium text-foreground">Instalar manualmente</p>
        <p>
          Toca{" "}
          <MoreVertical className="inline-block size-3.5 align-text-bottom" />{" "}
          arriba a la derecha y elige «Instalar app» o «Añadir a pantalla de
          inicio».
        </p>
      </div>
    );
  }

  return (
    <p className="text-center text-xs text-muted-foreground">
      Para instalar: usa «Añadir a pantalla de inicio» desde el menú del
      navegador.
    </p>
  );
}
