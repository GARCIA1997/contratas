"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
