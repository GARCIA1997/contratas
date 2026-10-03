import Link from "next/link";
import { cn } from "@/lib/utils";

/** Piezas comunes de las pantallas del monitor (mismas clases que Stitch). */

export function Tarjeta({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col rounded-xl bg-surface-container-low p-space-lg", className)}>{children}</div>;
}

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-space-sm rounded-xl bg-surface-container-low px-space-md py-space-sm lg:flex-row lg:items-center">
      <div className="flex items-center gap-space-md">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-secondary" />
        <div>
          <span className="font-headline-sm text-headline-sm text-on-surface">{titulo}</span>
          {subtitulo && <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitulo}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Chips de filtro que cambian un parámetro de la URL. */
export function Chips({
  base,
  param,
  activo,
  opciones,
  extra = {},
}: {
  base: string;
  param: string;
  activo: string;
  opciones: { valor: string; texto: string; cuenta?: number }[];
  extra?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-space-xs">
      {opciones.map((o) => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
        if (o.valor) p.set(param, o.valor);
        const sel = activo === o.valor;
        return (
          <Link
            key={o.valor || "todos"}
            href={`${base}?${p.toString()}`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-label-sm text-label-sm transition-colors",
              sel ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            )}
          >
            {o.texto}
            {o.cuenta !== undefined && (
              <span className={cn("rounded px-1 font-code-sm text-code-sm", sel ? "bg-on-primary-container/20" : "bg-surface-container-lowest")}>
                {o.cuenta}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function KpiSimple({ titulo, icono, valor, pie, tono = "text-on-surface" }: { titulo: string; icono: string; valor: string; pie?: string; tono?: string }) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-container-low p-space-md transition-all duration-200 hover:bg-surface-container">
      <div className="mb-1 flex items-center justify-between gap-space-xs">
        <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline">{titulo}</span>
        <span className="material-symbols-outlined text-[16px] text-outline">{icono}</span>
      </div>
      <span className={cn("my-1 font-metric-num text-metric-num", tono)}>{valor}</span>
      {pie && <span className="pt-1 font-label-xs text-label-xs text-on-surface-variant">{pie}</span>}
    </div>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="py-10 text-center font-body-sm text-body-sm text-on-surface-variant">{texto}</p>;
}
