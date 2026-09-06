"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PeriodoEstado } from "@/lib/services/estado-resultados";

/**
 * Descarga el estado de resultados completo en PDF.
 *
 * Igual que `corte-caja/descargar-pdf-boton.tsx`: un `<a>` a la ruta que
 * devuelve el PDF, sin fetch ni estado de carga — el navegador se encarga
 * de la descarga y el botón no tiene que manejar el buffer.
 *
 * Requiere red (el PDF se arma en el servidor con @react-pdf/renderer), a
 * diferencia del reporte en pantalla, que sí funciona offline.
 */
export function DescargarEstadoResultadosPdf({
  periodo = "MES",
  variant = "outline",
  size = "sm",
  className,
  children,
}: {
  periodo?: PeriodoEstado;
  variant?: "outline" | "default" | "ghost" | "secondary";
  size?: "sm" | "default";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Button variant={variant} size={size} className={className} asChild>
      <a href={`/api/estado-resultados/pdf?periodo=${periodo}`}>
        <FileDown className="size-4" />
        {children ?? "Descargar PDF"}
      </a>
    </Button>
  );
}

/**
 * Variante de ícono para Inicio: un botón redondo de vidrio, del tamaño
 * justo para el pulgar pero sin peso visual.
 *
 * Deliberadamente discreto — Inicio ya tiene su propia jerarquía (saludo,
 * filtros y tarjetas de KPIs) y un botón de ancho completo competía con
 * ella. Como ícono suelto acompaña al saludo sin robarse la atención, en
 * la misma línea visual que los controles de sincronización y versión que
 * ya viven arriba.
 *
 * `title` + `sr-only` en vez de solo el ícono: sin texto accesible, un
 * lector de pantalla anuncia nada más "enlace".
 */
export function DescargarPdfIcono({
  periodo = "MES",
  className,
}: {
  periodo?: PeriodoEstado;
  className?: string;
}) {
  return (
    <a
      href={`/api/estado-resultados/pdf?periodo=${periodo}`}
      title="Descargar estado de resultados en PDF"
      className={cn(
        "glass grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground",
        "shadow-[0_4px_16px_-6px_rgba(0,0,0,0.25)] transition-all duration-200",
        "hover:text-primary hover:shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.45)]",
        "active:scale-95",
        className
      )}
    >
      <FileDown className="size-[18px]" />
      <span className="sr-only">Descargar estado de resultados en PDF</span>
    </a>
  );
}
