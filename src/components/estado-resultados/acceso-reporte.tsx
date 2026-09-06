"use client";

import Link from "next/link";
import { ChartNoAxesCombined, ChevronRight } from "lucide-react";
import { formatMoneda } from "@/lib/utils";

/**
 * Entrada al estado de resultados desde Inicio.
 *
 * Usa `next/link` normal y no `OfflineAwareLink`: la pantalla de destino es
 * un Client Component que lee de IndexedDB, así que abre bien sin señal —
 * bloquearla offline sería quitarle al usuario algo que sí funciona.
 *
 * Muestra un dato real (la ganancia del mes) en vez de solo un rótulo: así
 * la fila informa aunque no la toquen, y da una razón concreta para entrar.
 */
export function AccesoEstadoResultados({
  gananciaMes,
}: {
  gananciaMes: number;
}) {
  return (
    <Link
      href="/estado-resultados"
      className="group flex items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/[0.04] to-transparent p-3 transition-all hover:border-primary/45 hover:shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.5)] active:scale-[0.99]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-105">
        <ChartNoAxesCombined className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          Estado de resultados
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {gananciaMes > 0
            ? `${formatMoneda(gananciaMes)} de ganancia este mes · ver el reporte completo`
            : "Cartera, ganancia y gráficas del negocio"}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
