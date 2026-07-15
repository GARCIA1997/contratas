"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { pendingCount } from "@/lib/offline/queue";
import { db } from "@/lib/offline/db";

/** Indicador mínimo de conectividad + operaciones pendientes de sincronizar. */
export function SyncStatusBadge({ ownerId }: { ownerId: string }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

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
      const n = await pendingCount(ownerId);
      if (!cancelado) setPending(n);
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

  if (online && pending === 0) return null;

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
