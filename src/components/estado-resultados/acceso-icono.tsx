"use client";

import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Acceso al estado de resultados desde Inicio: un ícono redondo de vidrio
 * junto al saludo.
 *
 * Deliberadamente discreto — Inicio ya tiene su propia jerarquía (saludo,
 * filtros y tarjetas de KPIs) y un botón de ancho completo competía con
 * ella. Como ícono suelto acompaña al saludo sin robarse la atención, en la
 * misma línea visual que los controles de sincronización y versión de
 * arriba.
 *
 * Usa `next/link` normal y no `OfflineAwareLink`: la pantalla de destino es
 * un Client Component que lee de IndexedDB, así que abre bien sin señal —
 * bloquearla offline sería quitarle al usuario algo que sí funciona. (La
 * descarga del PDF, que sí necesita servidor, vive dentro de esa pantalla.)
 *
 * `title` + `sr-only` porque es solo un ícono: sin texto accesible, un
 * lector de pantalla anunciaría nada más "enlace".
 */
export function AccesoEstadoResultadosIcono({
  className,
}: {
  className?: string;
}) {
  return (
    <Link
      href="/estado-resultados"
      title="Ver estado de resultados"
      className={cn(
        "glass grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground",
        "shadow-[0_4px_16px_-6px_rgba(0,0,0,0.25)] transition-all duration-200",
        "hover:text-primary hover:shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.45)]",
        "active:scale-95",
        className
      )}
    >
      <ChartNoAxesCombined className="size-[18px]" />
      <span className="sr-only">Ver estado de resultados</span>
    </Link>
  );
}
