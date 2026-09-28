"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/offline/db";
import { syncAll, syncDeudorDetalle } from "@/lib/offline/sync";
import { flushQueue } from "@/lib/offline/queue";
import { getTodosLosIds } from "@/lib/offline/repo";
import { prepararTodaLaApp } from "@/lib/offline/preparar-offline";
import { calidadConexion } from "@/lib/offline/conexion";
import {
  AVISO_OPERACIONES_LOCALES,
  LIMITE_OPERACIONES_LOCALES,
  modoLocalActivo,
  setModoLocal,
  suscribirseAModoLocal,
} from "@/lib/offline/modo-local";
import { cn } from "@/lib/utils";

type Estado = "quieto" | "descargando" | "sincronizando";

/**
 * Switch de sincronización del encabezado.
 *
 * - Encendido (por defecto): la app sincroniza sola, como siempre.
 * - Al apagarlo: primero sube lo pendiente y baja ABSOLUTAMENTE todo
 *   (datos de cada entidad, abonos de cada deudor y todas las pantallas),
 *   y luego pasa a modo local — nada sale a la red y todo se encola.
 * - Al encenderlo: sube la cola y vuelve a bajar los datos del servidor.
 *
 * En modo local muestra cuántos movimientos lleva acumulados contra el
 * límite de seguridad (ver LIMITE_OPERACIONES_LOCALES).
 */
export function ModoSyncSwitch({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const local = useSyncExternalStore(suscribirseAModoLocal, modoLocalActivo, () => false);
  const [estado, setEstado] = useState<Estado>("quieto");
  const [pct, setPct] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const cancelado = useRef(false);

  const pendientes =
    useLiveQuery(
      () => db?.writeQueue.where("ownerId").equals(ownerId).count() ?? 0,
      [ownerId]
    ) ?? 0;

  async function apagar() {
    setAviso(null);
    if (calidadConexion() === "sin-red") {
      // Sin señal no hay nada que bajar: se trabaja con lo que ya hay.
      setModoLocal(true);
      setAviso("Sin señal: se usará lo que ya estaba descargado");
      return;
    }
    cancelado.current = false;
    setEstado("descargando");
    setPct(0);
    try {
      await flushQueue(ownerId);
      await syncAll(ownerId, { forzar: true });
      const ids = await getTodosLosIds(ownerId);
      // Los abonos de cada deudor no vienen en el sync general.
      for (let i = 0; i < ids.deudores.length; i++) {
        if (cancelado.current) break;
        await syncDeudorDetalle(ownerId, ids.deudores[i]).catch(() => undefined);
      }
      if (!cancelado.current) {
        const r = await prepararTodaLaApp(router, ids, {
          onProgreso: ({ hechas, total }) =>
            setPct(total > 0 ? Math.round((hechas / total) * 100) : 0),
          cancelado: () => cancelado.current,
        });
        if (r.hechas < r.total) setAviso("Descarga incompleta: algunas pantallas podrían no abrir");
      } else {
        setAviso("Descarga detenida: algunas pantallas podrían no abrir");
      }
    } catch {
      setAviso("No se pudo descargar todo; se usará lo que ya había");
    } finally {
      setModoLocal(true);
      setEstado("quieto");
    }
  }

  async function encender() {
    setAviso(null);
    setModoLocal(false);
    if (calidadConexion() === "sin-red") {
      setAviso("Sin señal: se sincronizará en cuanto haya conexión");
      return;
    }
    setEstado("sincronizando");
    try {
      await flushQueue(ownerId);
      await syncAll(ownerId, { forzar: true });
    } finally {
      setEstado("quieto");
    }
  }

  function alTocar() {
    if (estado === "descargando") {
      cancelado.current = true;
      return;
    }
    if (estado === "sincronizando") return;
    void (local ? encender() : apagar());
  }

  const encendido = !local;
  const cercaDelLimite = local && pendientes >= AVISO_OPERACIONES_LOCALES;
  const etiqueta =
    estado === "descargando"
      ? `Descargando ${pct}%`
      : estado === "sincronizando"
        ? "Sincronizando…"
        : local
          ? `Local · ${pendientes}/${LIMITE_OPERACIONES_LOCALES}`
          : "Sync";
  const titulo =
    estado === "descargando"
      ? "Descargando todo — tócalo para detener"
      : local
        ? "Modo local: todo se guarda en el teléfono. Enciende para sincronizar."
        : "Sincronizando con la nube. Apaga para descargar todo y trabajar local.";

  return (
    <div className="flex items-center gap-1.5">
      {aviso && (
        <span className="max-w-[9rem] truncate text-[10px] text-muted-foreground" title={aviso}>
          {aviso}
        </span>
      )}
      <span
        className={cn(
          "whitespace-nowrap text-[10px] font-medium tabular-nums",
          cercaDelLimite ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {etiqueta}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={encendido}
        aria-label={titulo}
        title={titulo}
        onClick={alTocar}
        disabled={estado === "sincronizando"}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          encendido ? "bg-pagado" : "bg-muted-foreground/40"
        )}
      >
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full bg-white shadow transition-transform",
            encendido ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        >
          {estado !== "quieto" && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </span>
      </button>
    </div>
  );
}
