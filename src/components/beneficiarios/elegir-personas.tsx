"use client";

import { Check } from "lucide-react";
import { cn, formatMoneda } from "@/lib/utils";
import type { Persona } from "@/lib/cobro-por-persona";

/**
 * Lista de personas con casilla (titular y beneficiarios) para elegir de
 * quién se cobra. Renglones grandes para tocarlos de pie en la calle.
 */
export function ElegirPersonas<T>({
  personas,
  seleccion,
  onChange,
  detalle,
}: {
  personas: Persona<T>[];
  seleccion: string[];
  onChange: (claves: string[]) => void;
  /** Texto chico bajo el nombre (p. ej. "Cuota 3 · Semanal $5,000"). */
  detalle?: (p: Persona<T>) => string;
}) {
  return (
    // Con muchos beneficiarios la lista se desliza sola y los botones de
    // cobrar quedan siempre a la vista.
    <ul className="max-h-[45dvh] divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-2xl border border-border/60 text-left">
      {personas.map((p) => {
        const marcada = seleccion.includes(p.clave);
        return (
          <li key={p.clave}>
            <button
              type="button"
              role="checkbox"
              aria-checked={marcada}
              onClick={() => onChange(marcada ? seleccion.filter((c) => c !== p.clave) : [...seleccion, p.clave])}
              className={cn("flex w-full items-center gap-3 px-3 py-3 text-left transition-colors", marcada ? "bg-pagado/10" : "")}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border",
                  marcada ? "border-pagado bg-pagado text-background" : "border-border"
                )}
              >
                {marcada && <Check className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {p.nombre}
                  {p.esTitular && <span className="font-normal text-muted-foreground"> (titular)</span>}
                </span>
                {detalle && <span className="block truncate text-xs text-muted-foreground">{detalle(p)}</span>}
              </span>
              <span className="shrink-0 text-sm font-semibold">{formatMoneda(p.total)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
