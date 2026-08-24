"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncAll } from "@/lib/offline/sync";
import { flushQueue } from "@/lib/offline/queue";
import { cn } from "@/lib/utils";

/**
 * Fuerza una recarga manual: vacía la cola de escrituras pendientes,
 * vuelve a traer todo del servidor a IndexedDB y refresca la ruta actual.
 * Cubre los casos donde una mutación no disparó el sync automático
 * (p. ej. tras crear/editar algo) sin tener que cerrar sesión.
 */
export function RefreshButton({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function recargar() {
    if (cargando) return;
    setCargando(true);
    try {
      await flushQueue(ownerId);
      await syncAll(ownerId, { forzar: true });
      router.refresh();
    } finally {
      setCargando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={recargar}
      disabled={cargando}
      aria-label="Recargar datos"
      title="Recargar datos"
      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={cn("size-4", cargando && "animate-spin")} />
    </button>
  );
}
