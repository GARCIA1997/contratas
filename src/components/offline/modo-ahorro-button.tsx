"use client";

import { useEffect, useState } from "react";
import { Gauge, Zap } from "lucide-react";
import {
  calidadConexion,
  modoAhorroManual,
  setModoAhorroManual,
  suscribirseAConexion,
  type CalidadConexion,
} from "@/lib/offline/conexion";
import { cn } from "@/lib/utils";

/**
 * Interruptor manual de modo ahorro, al lado de «Recargar datos».
 *
 * La app ya detecta sola una red lenta (`navigator.connection`), pero esa
 * señal no existe en iOS y de todos modos llega tarde: cuando el navegador
 * la reporta, la pantalla ya se sintió trabada. Quien anda en campo sabe de
 * antemano en qué comunidades no vale la pena intentarlo, así que este
 * botón le deja adelantarse.
 *
 * Encendido: no se sincroniza solo ni se precargan pantallas; las
 * escrituras siguen guardándose y subiéndose en cuanto se pueda.
 */
export function ModoAhorroButton() {
  const [manual, setManual] = useState(false);
  const [calidad, setCalidad] = useState<CalidadConexion>("rapida");

  useEffect(() => {
    function leer() {
      setManual(modoAhorroManual());
      setCalidad(calidadConexion());
    }
    leer();
    return suscribirseAConexion(leer);
  }, []);

  // Sin red el ahorro es irrelevante (ya no se intenta nada) y el badge de
  // estado ya lo comunica — un control extra ahí solo estorba.
  if (calidad === "sin-red") return null;

  const activo = manual || calidad === "lenta";
  const porRed = !manual && calidad === "lenta";

  return (
    <button
      type="button"
      onClick={() => setModoAhorroManual(!manual)}
      aria-pressed={activo}
      aria-label={activo ? "Desactivar modo ahorro" : "Activar modo ahorro"}
      title={
        porRed
          ? "Modo ahorro activo: se detectó red lenta. Tócalo para forzarlo también cuando la red mejore."
          : activo
            ? "Modo ahorro activado a mano. No se sincroniza solo ni se precargan pantallas. Tócalo para desactivarlo."
            : "Activar modo ahorro: deja de sincronizar y precargar en segundo plano, para que la app responda rápido con red mala."
      }
      className={cn(
        "flex size-7 items-center justify-center rounded-full transition-colors",
        activo
          ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {activo ? <Gauge className="size-4" /> : <Zap className="size-4" />}
    </button>
  );
}
