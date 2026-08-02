"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { conflictCount, pendingCount, reintentarConflictos } from "@/lib/offline/queue";
import { db } from "@/lib/offline/db";

/** Indicador mínimo de conectividad + operaciones pendientes de sincronizar. */
export function SyncStatusBadge({ ownerId }: { ownerId: string }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [conflictos, setConflictos] = useState(0);
  const [reintentando, setReintentando] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
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

  if (online && pending === 0) return null;

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
      ) : (
        <>
          <RefreshCw className="size-3 animate-spin" /> Sincronizando {pending}
        </>
      )}
    </div>
  );
}
