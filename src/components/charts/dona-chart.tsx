import { cn } from "@/lib/utils";

export type RebanadaDona = {
  label: string;
  valor: number;
  /** Color CSS ya resuelto, p. ej. `hsl(var(--chart-1))`. */
  color: string;
};

/**
 * Dona (gráfica de "queso" con centro hueco), dibujada con `stroke-dasharray`
 * sobre un solo círculo en vez de arcos `path`.
 *
 * El truco del dash-array evita el caso degenerado clásico de las donas: una
 * rebanada del 100% con un `path` de arco vuelve iguales el punto inicial y
 * el final y el navegador no dibuja nada. Con dashes, el 100% es simplemente
 * un dash tan largo como la circunferencia — se ve bien sin casos especiales.
 */
export function DonaChart({
  rebanadas,
  centroValor,
  centroLabel,
  size = 168,
  grosor = 22,
  className,
}: {
  rebanadas: RebanadaDona[];
  /** Texto grande en el hueco (normalmente el total). */
  centroValor?: string;
  centroLabel?: string;
  size?: number;
  grosor?: number;
  className?: string;
}) {
  const total = rebanadas.reduce((s, r) => s + Math.max(0, r.valor), 0);
  const radio = (size - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;

  let acumulado = 0;
  const arcos = rebanadas
    .filter((r) => r.valor > 0)
    .map((r) => {
      const fraccion = r.valor / total;
      const largo = fraccion * circunferencia;
      const arco = {
        ...r,
        largo,
        // Negativo: `stroke-dashoffset` corre el dash en sentido contrario al
        // avance, así que para ir apilando rebanadas hay que restarle lo ya
        // dibujado.
        offset: -acumulado,
        porcentaje: Math.round(fraccion * 1000) / 10,
      };
      acumulado += largo;
      return arco;
    });

  if (total <= 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-xs text-muted-foreground",
          className
        )}
        style={{ height: size }}
      >
        Sin datos para graficar
      </div>
    );
  }

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={rebanadas
          .filter((r) => r.valor > 0)
          .map((r) => `${r.label}: ${Math.round((r.valor / total) * 100)}%`)
          .join(", ")}
      >
        {/* Pista de fondo: da forma a la dona aunque una sola rebanada
            domine, y marca el hueco visualmente. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={grosor}
        />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcos.map((a) => (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={radio}
              fill="none"
              stroke={a.color}
              strokeWidth={grosor}
              strokeDasharray={`${a.largo} ${circunferencia - a.largo}`}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
            >
              <title>{`${a.label}: ${a.porcentaje}%`}</title>
            </circle>
          ))}
        </g>
      </svg>

      {(centroValor || centroLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {centroValor && (
            <p className="truncate text-base font-bold leading-tight">{centroValor}</p>
          )}
          {centroLabel && (
            <p className="text-[10px] leading-tight text-muted-foreground">{centroLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Leyenda de la dona: color, etiqueta, valor y % — pensada para ir al lado. */
export function LeyendaDona({
  rebanadas,
  formato,
}: {
  rebanadas: RebanadaDona[];
  formato: (n: number) => string;
}) {
  const total = rebanadas.reduce((s, r) => s + Math.max(0, r.valor), 0);
  return (
    <ul className="min-w-0 flex-1 space-y-2">
      {rebanadas.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-xs">
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: r.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.label}</span>
          <span className="shrink-0 font-semibold tabular-nums">{formato(r.valor)}</span>
          <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
            {total > 0 ? Math.round((r.valor / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
}
