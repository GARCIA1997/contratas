import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Gráficas SVG del monitor. Mismos trazos, gradientes y colores que las del
 * diseño de Stitch, pero calculados a partir de los datos reales.
 */

type Punto = { t: string; movimientos: number; errores: number };

/** Línea mini para las tarjetas KPI (80×24, como en el diseño). */
export function Sparkline({ valores, clase }: { valores: number[]; clase: string }) {
  const v = valores.length > 1 ? valores : [0, ...valores, 0];
  const max = Math.max(...v, 1);
  const d = v
    .map((n, i) => {
      const x = (i / (v.length - 1)) * 80;
      const y = 22 - (n / max) * 19;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className={`h-6 w-20 ${clase}`} fill="none" viewBox="0 0 80 24">
      <path d={d} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

/** Curva suave (Catmull-Rom → Bézier) que pasa por todos los puntos. */
function curva(pts: [number, number][], piso = 240, techo = 30): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]![0]} ${pts[0]![1]}`;
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    // Los puntos de control se limitan al área de la gráfica: sin esto, un
    // pico aislado hace que la curva baje de cero antes y después.
    const lim = (v: number) => Math.min(piso, Math.max(techo, v));
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = lim(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = lim(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function escalaY(max: number): number {
  if (max <= 4) return 4;
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / paso) * paso;
}

/** "Actividad por hora/día": movimientos y errores, con el pico marcado. */
export function GraficaActividad({ serie, porHora }: { serie: Punto[]; porHora: boolean }) {
  const X0 = 50;
  const X1 = 840;
  const Y0 = 30;
  const Y1 = 240;
  const maxMov = escalaY(Math.max(...serie.map((p) => p.movimientos), 0));
  const n = Math.max(serie.length - 1, 1);
  const x = (i: number) => X0 + (i / n) * (X1 - X0);
  const y = (v: number) => Y1 - (v / maxMov) * (Y1 - Y0);
  const mov = serie.map((p, i) => [x(i), y(p.movimientos)] as [number, number]);
  const err = serie.map((p, i) => [x(i), y(p.errores)] as [number, number]);
  const lineaMov = curva(mov);
  const lineaErr = curva(err);
  const iPico = serie.reduce((m, p, i, a) => (p.movimientos > a[m]!.movimientos ? i : m), 0);
  const pico = serie[iPico];
  const etiqueta = (iso: string) =>
    porHora ? format(new Date(iso), "HH:mm") : format(new Date(iso), "d MMM", { locale: es });
  const marcas = serie.length <= 1 ? [0] : [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1].map((f) => Math.round(f * n));

  return (
    <div className="relative h-72 w-full">
      <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 850 280">
        <defs>
          <linearGradient id="primaryAreaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4c8eff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4c8eff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="errorAreaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffb4ab" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffb4ab" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            stroke="#2e3544"
            strokeDasharray="4 4"
            strokeWidth="0.75"
            x1="40"
            x2="840"
            y1={Y0 + f * (Y1 - Y0)}
            y2={Y0 + f * (Y1 - Y0)}
          />
        ))}
        <line stroke="#2e3544" strokeWidth="1" x1="40" x2="840" y1={Y1} y2={Y1} />
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <text key={f} fill="#8b90a0" fontFamily="Inter" fontSize="10" textAnchor="end" x="32" y={Y1 - f * (Y1 - Y0) + 4}>
            {Math.round(maxMov * f)}
          </text>
        ))}
        {lineaMov && (
          <>
            <path d={`${lineaMov} L ${X1} ${Y1} L ${X0} ${Y1} Z`} fill="url(#primaryAreaGrad)" />
            <path d={lineaMov} fill="none" stroke="#4c8eff" strokeLinecap="round" strokeWidth="2.5" />
            <path d={`${lineaErr} L ${X1} ${Y1} L ${X0} ${Y1} Z`} fill="url(#errorAreaGrad)" />
            <path d={lineaErr} fill="none" stroke="#ffb4ab" strokeLinecap="round" strokeWidth="2" />
          </>
        )}
        {pico && pico.movimientos > 0 && (
          <>
            <line stroke="#adc6ff" strokeDasharray="3 3" strokeWidth="1.2" x1={x(iPico)} x2={x(iPico)} y1={Y0} y2={Y1} />
            <circle cx={x(iPico)} cy={y(pico.movimientos)} fill="#4c8eff" r="5" stroke="#0c1321" strokeWidth="2" />
            <circle cx={x(iPico)} cy={y(pico.errores)} fill="#ffb4ab" r="4" stroke="#0c1321" strokeWidth="2" />
          </>
        )}
        {marcas.map((i) =>
          serie[i] ? (
            <text
              key={i}
              fill={i === iPico ? "#adc6ff" : "#8b90a0"}
              fontFamily="JetBrains Mono"
              fontSize="10"
              fontWeight={i === iPico ? 600 : 400}
              textAnchor="middle"
              x={x(i)}
              y="260"
            >
              {etiqueta(serie[i]!.t)}
            </text>
          ) : null
        )}
      </svg>
      {pico && pico.movimientos > 0 && (
        <div
          className="pointer-events-none absolute top-4 flex -translate-x-1/2 flex-col gap-1 rounded-lg bg-surface-container-highest px-3 py-2 shadow-xl"
          style={{ left: `${Math.min(88, Math.max(12, (x(iPico) / 850) * 100))}%` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-code-sm text-code-sm text-on-surface-variant">{etiqueta(pico.t)}</span>
            <span className="rounded bg-surface-container px-1.5 py-0.5 font-label-xs text-label-xs text-secondary">
              Máximo
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1 font-body-sm text-body-sm text-primary">
              <span className="h-2 w-2 rounded-full bg-primary-container" />
              {pico.movimientos} movs
            </span>
            <span className="flex items-center gap-1 font-body-sm text-body-sm text-error">
              <span className="h-2 w-2 rounded-full bg-error" />
              {pico.errores} errores
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
