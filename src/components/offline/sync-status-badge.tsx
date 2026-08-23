"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, Gauge, RefreshCw } from "lucide-react";
import { conflictCount, pendingCount, reintentarConflictos } from "@/lib/offline/queue";
import { db } from "@/lib/offline/db";
import {
  calidadConexion,
  suscribirseAConexion,
  type CalidadConexion,
} from "@/lib/offline/conexion";

/** Indicador mínimo de conectividad + operaciones pendientes de sincronizar. */
export function SyncStatusBadge({ ownerId }: { ownerId: string }) {
  const [calidad, setCalidad] = useState<CalidadConexion>("rapida");
  const [pending, setPending] = useState(0);
  const [conflictos, setConflictos] = useState(0);
  const [reintentando, setReintentando] = useState(false);
  const online = calidad !== "sin-red";

  useEffect(() => {
    const leer = () => setCalidad(calidadConexion());
    leer();
    return suscribirseAConexion(leer);
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function tick() {
      const [n, c] = await Promise.all([
        pendingCount(ownerId),
        conflictCount(ownerId),
      ]);
      if (!cancelado) {
        setPending(n);
        setConflictos(c);
      }
    }
    tick();
    const interval = setInterval(tick, 3000);
    const table = db?.writeQueue;
    // Dexie no expone un evento simple aquí sin dexie-react-hooks; el
    // polling ligero cada 3s es suficiente para este badge informativo.
    return () => {
      cancelado = true;
      clearInterval(interval);
      void table;
    };
  }, [ownerId]);

  async function reintentar() {
    setReintentando(true);
    try {
      await reintentarConflictos(ownerId);
    } finally {
      setReintentando(false);
    }
  }

  // Con red lenta el badge se queda visible aunque no haya nada pendiente:
  // es la única señal de que la app dejó de sincronizar sola, y sin ella
  // parecería que los datos están al día cuando no lo están.
  if (online && pending === 0 && calidad !== "lenta") return null;

  // Las operaciones "en conflicto" nunca se reintentan solas (ver
  // queue.ts) — sin esta distinción, un elemento atorado se veía igual que
  // uno sincronizando normalmente, indefinidamente (bug reportado en campo:
  // "1 elemento sin sincronizar" que nunca desaparecía).
  if (conflictos > 0) {
    return (
      <button
        type="button"
        onClick={reintentar}
        disabled={reintentando || !online}
        title="Esta operación no se pudo aplicar automáticamente. Toca para reintentar."
        className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive disabled:opacity-60"
      >
        <AlertTriangle className="size-3" />
        {reintentando ? "Reintentando…" : `${conflictos} necesita${conflictos > 1 ? "n" : ""} reintentarse`}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {!online ? (
        <>
          <CloudOff className="size-3" /> Sin conexión
          {pending > 0 && ` · ${pending} por sincronizar`}
        </>
      ) : calidad === "lenta" ? (
        <>
          <Gauge className="size-3" /> Red lenta
          {pending > 0 && ` · ${pending} por enviar`}
        </>
      ) : (
        <>
          <RefreshCw className="size-3 animate-spin" /> Sincronizando {pending}
        </>
      )}
    </div>
  );
}
