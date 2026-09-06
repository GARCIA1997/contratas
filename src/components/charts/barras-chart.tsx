import { cn } from "@/lib/utils";
import { LeyendaSeries } from "@/components/charts/linea-chart";

export type SerieBarras = {
  label: string;
  color: string;
  valores: number[];
};

/**
 * Barras agrupadas por categoría (un grupo por mes, una barra por serie).
 *
 * Hecho con divs y flexbox en vez de SVG a propósito: las barras son
 * rectángulos que el layout del navegador ya sabe repartir y escalar solo,
 * sin la deformación que trae estirar un viewBox (ver el comentario de
 * `linea-chart.tsx`).
 */
export function BarrasChart({
  series,
  etiquetas,
  formato,
  altura = 140,
  className,
}: {
  series: SerieBarras[];
  etiquetas: string[];
  formato: (n: number) => string;
  altura?: number;
  className?: string;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.valores));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between text-[10px] text-muted-foreground">
        <span>Máximo</span>
        <span className="font-semibold tabular-nums text-foreground">
          {formato(max)}
        </span>
      </div>

      <div className="flex items-end gap-1" style={{ height: altura }}>
        {etiquetas.map((et, i) => (
          <div
            key={et}
            className="flex h-full flex-1 items-end justify-center gap-[2px]"
          >
            {series.map((s) => {
              const valor = s.valores[i] ?? 0;
              return (
                <div
                  key={s.label}
                  className="w-full max-w-[14px] rounded-t-sm transition-all"
                  style={{
                    // Un mínimo de 2px para que un mes en cero se vea como
                    // una línea base y no como un hueco (que se confunde con
                    // "no hay dato").
                    height: `${Math.max(2, (valor / max) * 100)}%`,
                    backgroundColor: s.color,
                  }}
                  title={`${et} — ${s.label}: ${formato(valor)}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex justify-between gap-0.5 border-t pt-1.5">
        {etiquetas.map((et, i) => (
          <span
            key={et}
            className={cn(
              "flex-1 truncate text-center text-[9px] capitalize text-muted-foreground sm:text-[10px]",
              etiquetas.length > 8 && i % 2 === 1 && "hidden sm:block"
            )}
          >
            {et}
          </span>
        ))}
      </div>

      <LeyendaSeries series={series} />
    </div>
  );
}

export type BarraHorizontal = {
  id: string;
  label: string;
  valor: number;
  /** Segunda línea bajo la etiqueta (ej. "2 contratas · saldo $3,400"). */
  detalle?: string;
};

/**
 * Ranking en barras horizontales — el formato que mejor se lee para un top 5
 * de nombres largos en un celular (la etiqueta va arriba, la barra debajo,
 * sin competir por el ancho).
 */
export function BarrasHorizontales({
  filas,
  formato,
  color,
  vacio = "Sin datos todavía.",
}: {
  filas: BarraHorizontal[];
  formato: (n: number) => string;
  color: string;
  vacio?: string;
}) {
  if (filas.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">{vacio}</p>;
  }
  const max = Math.max(1, ...filas.map((f) => f.valor));

  return (
    <ol className="space-y-2.5">
      {filas.map((f, i) => (
        <li key={f.id} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium">
              <span className="mr-1.5 text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              {f.label}
            </p>
            <p className="shrink-0 text-xs font-semibold tabular-nums">
              {formato(f.valor)}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(3, (f.valor / max) * 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
          {f.detalle && (
            <p className="text-[10px] text-muted-foreground">{f.detalle}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
