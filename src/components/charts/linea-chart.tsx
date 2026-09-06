import { cn } from "@/lib/utils";

export type SerieLinea = {
  label: string;
  /** Color CSS ya resuelto, p. ej. `hsl(var(--chart-1))`. */
  color: string;
  valores: number[];
  /** Rellena el área bajo la línea con un degradado. Solo para la serie principal. */
  area?: boolean;
};

const ANCHO = 1000;
const ALTO = 260;

/**
 * Gráfica de líneas para series mensuales.
 *
 * El SVG usa `preserveAspectRatio="none"` para estirarse a lo ancho del
 * contenedor sin dejar franjas vacías, lo que deforma cualquier cosa que
 * viva dentro de él. Por eso aquí adentro NO hay texto ni círculos: solo
 * trazos, y cada trazo lleva `vector-effect="non-scaling-stroke"` para
 * conservar su grosor real. Las etiquetas (meses, máximo, leyenda) son HTML
 * alrededor del SVG, no elementos SVG — así se leen nítidas en cualquier
 * ancho de pantalla.
 */
export function LineaChart({
  series,
  etiquetas,
  formato,
  className,
}: {
  series: SerieLinea[];
  etiquetas: string[];
  formato: (n: number) => string;
  className?: string;
}) {
  const todos = series.flatMap((s) => s.valores);
  const max = Math.max(1, ...todos);
  const n = etiquetas.length;

  // Con un solo punto no hay línea que trazar: se dibuja al centro para que
  // el punto único no quede pegado al borde izquierdo.
  const x = (i: number) => (n <= 1 ? ANCHO / 2 : (i / (n - 1)) * ANCHO);
  const y = (v: number) => ALTO - (v / max) * ALTO;

  const gradienteId = `area-${series[0]?.label.replace(/\W/g, "") ?? "serie"}`;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between text-[10px] text-muted-foreground">
        <span>Máximo del período</span>
        <span className="font-semibold tabular-nums text-foreground">
          {formato(max)}
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          className="h-40 w-full overflow-visible sm:h-48"
          role="img"
          aria-label={`Evolución mensual: ${series.map((s) => s.label).join(", ")}`}
        >
          <defs>
            <linearGradient id={gradienteId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={series[0]?.color}
                stopOpacity="0.28"
              />
              <stop
                offset="100%"
                stopColor={series[0]?.color}
                stopOpacity="0.02"
              />
            </linearGradient>
          </defs>

          {/* Cuadrícula: cuartos del máximo. */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={ANCHO}
              y1={ALTO * f}
              y2={ALTO * f}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={f === 1 ? undefined : "3 5"}
            />
          ))}

          {series.map((s) => {
            const puntos = s.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
            return (
              <g key={s.label}>
                {s.area && n > 1 && (
                  <polygon
                    points={`0,${ALTO} ${puntos} ${ANCHO},${ALTO}`}
                    fill={`url(#${gradienteId})`}
                  />
                )}
                <polyline
                  points={puntos}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* Franjas invisibles para el tooltip nativo de cada mes. */}
          {etiquetas.map((et, i) => (
            <rect
              key={et}
              x={n <= 1 ? 0 : (i - 0.5) * (ANCHO / (n - 1))}
              y={0}
              width={n <= 1 ? ANCHO : ANCHO / (n - 1)}
              height={ALTO}
              fill="transparent"
            >
              <title>
                {`${et} — ${series
                  .map((s) => `${s.label}: ${formato(s.valores[i] ?? 0)}`)
                  .join(" · ")}`}
              </title>
            </rect>
          ))}
        </svg>
      </div>

      <div className="flex justify-between gap-0.5">
        {etiquetas.map((et, i) => (
          <span
            key={et}
            className={cn(
              "flex-1 truncate text-center text-[9px] capitalize text-muted-foreground sm:text-[10px]",
              // En pantallas chicas 12 meses no caben: se muestra uno sí uno
              // no, y el resto sigue disponible en el tooltip.
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

export function LeyendaSeries({
  series,
}: {
  series: { label: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-sm"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
