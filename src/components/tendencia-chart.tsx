import { formatMoneda } from "@/lib/utils";
import type { MesTendencia } from "@/lib/services/dashboard";

/**
 * Barras dobles (colocado vs cobrado) por mes, sin librería de gráficas —
 * el dataset es chico (6 meses) y no justifica una dependencia nueva.
 */
export function TendenciaChart({ meses }: { meses: MesTendencia[] }) {
  const max = Math.max(1, ...meses.flatMap((m) => [m.colocado, m.cobrado]));

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-1.5" style={{ height: 96 }}>
        {meses.map((m) => (
          <div key={m.mes} className="flex flex-1 items-end justify-center gap-0.5">
            <div
              className="w-full max-w-[10px] rounded-t bg-primary/30"
              style={{ height: `${Math.max(2, (m.colocado / max) * 100)}%` }}
              title={`Colocado ${formatMoneda(m.colocado)}`}
            />
            <div
              className="w-full max-w-[10px] rounded-t bg-primary"
              style={{ height: `${Math.max(2, (m.cobrado / max) * 100)}%` }}
              title={`Cobrado ${formatMoneda(m.cobrado)}`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-1">
        {meses.map((m) => (
          <p
            key={m.mes}
            className="flex-1 truncate text-center text-[10px] capitalize text-muted-foreground"
          >
            {m.label}
          </p>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary/30" /> Colocado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary" /> Cobrado
        </span>
      </div>
    </div>
  );
}
