"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Check, Loader2 } from "lucide-react";
import { syncAll } from "@/lib/offline/sync";
import { flushQueue } from "@/lib/offline/queue";
import { getTodosLosIds } from "@/lib/offline/repo";
import {
  prepararTodaLaApp,
  ultimaPreparacion,
} from "@/lib/offline/preparar-offline";
import { calidadConexion } from "@/lib/offline/conexion";
import { cn } from "@/lib/utils";

type Estado = "listo" | "preparando" | "terminado" | "error";

function haceCuanto(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/**
 * «Preparar para trabajar sin señal»: descarga la app completa del
 * administrador activo para que en campo no falte ninguna pantalla.
 *
 * Pensado para tocarse con wifi antes de salir. Es distinto de la precarga
 * automática del dashboard, que es ligera y solo cubre la ruta del día — la
 * automática no puede bajarlo todo porque competiría con lo que el usuario
 * está tocando en ese momento.
 */
export function PrepararOfflineButton({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("listo");
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });
  const [ultima, setUltima] = useState<Date | null>(null);
  const cancelado = useRef(false);

  useEffect(() => setUltima(ultimaPreparacion()), []);

  // Vuelve a "listo" tras mostrar el palomeo un momento.
  useEffect(() => {
    if (estado !== "terminado") return;
    const t = setTimeout(() => setEstado("listo"), 4000);
    return () => clearTimeout(t);
  }, [estado]);

  async function preparar() {
    if (estado === "preparando") {
      cancelado.current = true;
      return;
    }
    if (calidadConexion() === "sin-red") return;

    cancelado.current = false;
    setEstado("preparando");
    setProgreso({ hechas: 0, total: 0 });
    try {
      // Primero los datos (Dexie), luego las pantallas: de nada sirve tener
      // la pantalla cacheada si los datos que va a leer están viejos.
      await flushQueue(ownerId);
      await syncAll(ownerId, { forzar: true });
      if (cancelado.current) return setEstado("listo");

      const ids = await getTodosLosIds(ownerId);
      const r = await prepararTodaLaApp(router, ids, {
        onProgreso: setProgreso,
        cancelado: () => cancelado.current,
      });
      if (r.hechas < r.total) {
        setEstado("listo");
      } else {
        setUltima(new Date());
        setEstado("terminado");
      }
    } catch {
      setEstado("error");
    }
  }

  const pct =
    progreso.total > 0 ? Math.round((progreso.hechas / progreso.total) * 100) : 0;

  const titulo =
    estado === "preparando"
      ? `Preparando… ${pct}% — tócalo para detener`
      : estado === "error"
        ? "No se pudo preparar. Revisa tu señal e intenta de nuevo."
        : ultima
          ? `Preparar para trabajar sin señal (última vez ${haceCuanto(ultima)})`
          : "Preparar para trabajar sin señal: descarga toda la app para usarla en campo";

  return (
    <div className="flex items-center gap-1.5">
      {estado === "preparando" && (
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          Preparando {pct}%
        </span>
      )}
      {estado === "terminado" && (
        <span className="text-[10px] font-medium text-pagado">
          Listo para trabajar sin señal
        </span>
      )}
      <button
        type="button"
        onClick={preparar}
        aria-label={titulo}
        title={titulo}
        className={cn(
          "flex size-7 items-center justify-center rounded-full transition-colors",
          estado === "terminado"
            ? "text-pagado"
            : estado === "error"
              ? "text-destructive hover:bg-destructive/10"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {estado === "preparando" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : estado === "terminado" ? (
          <Check className="size-4" />
        ) : (
          <CloudDownload className="size-4" />
        )}
      </button>
    </div>
  );
}
