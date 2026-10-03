import { format } from "date-fns";
import { es } from "date-fns/locale";
import { desdeDe, getNegocio } from "@/lib/monitor/datos";
import { dinero, dineroCorto, iniciales, numero } from "@/components/monitor/formato";
import { Encabezado, KpiSimple, Tarjeta, Vacio } from "@/components/monitor/ui";
import { ETIQUETA_RANGO, rangoDeParams } from "../../_rango";

export const dynamic = "force-dynamic";

const TIPOS = [
  { tipo: "SEMANAL", texto: "Semanal", color: "#4c8eff", punto: "bg-primary-container" },
  { tipo: "QUINCENAL", texto: "Quincenal", color: "#4edea3", punto: "bg-secondary" },
  { tipo: "MENSUAL", texto: "Mensual", color: "#ffb95f", punto: "bg-tertiary" },
] as const;

function Barras({ datos }: { datos: { dia: string; total: number }[] }) {
  if (datos.length === 0) return <Vacio texto="Sin cobros en el periodo." />;
  const max = Math.max(...datos.map((d) => d.total), 1);
  const iMax = datos.findIndex((d) => d.total === max);
  const ancho = 800 / datos.length;
  return (
    <svg className="h-64 w-full" preserveAspectRatio="none" viewBox="0 0 820 240">
      {[0, 0.25, 0.5, 0.75].map((f) => (
        <line key={f} stroke="#2e3544" strokeDasharray="4 4" strokeWidth="0.75" x1="10" x2="810" y1={20 + f * 190} y2={20 + f * 190} />
      ))}
      <line stroke="#2e3544" x1="10" x2="810" y1="210" y2="210" />
      {datos.map((d, i) => {
        const h = (d.total / max) * 185;
        const x = 10 + i * ancho + ancho * 0.15;
        return (
          <g key={d.dia}>
            <rect x={x} y={210 - h} width={ancho * 0.7} height={h} rx="4" fill={i === iMax ? "#4edea3" : "#4c8eff"} opacity={i === iMax ? 1 : 0.75}>
              <title>{`${format(new Date(d.dia), "d MMM", { locale: es })}: ${dinero(d.total)}`}</title>
            </rect>
            {(datos.length <= 10 || i % Math.ceil(datos.length / 8) === 0) && (
              <text x={x + ancho * 0.35} y="230" fill="#8b90a0" fontFamily="JetBrains Mono" fontSize="10" textAnchor="middle">
                {format(new Date(d.dia), "d MMM", { locale: es })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Dona({ partes }: { partes: { valor: number; color: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  const R = 54;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90">
      <circle cx="70" cy="70" r={R} fill="none" stroke="#19202e" strokeWidth="18" />
      {partes.map((p, i) => {
        const largo = (p.valor / total) * C;
        const el = (
          <circle
            key={i}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={p.color}
            strokeWidth="18"
            strokeDasharray={`${largo} ${C - largo}`}
            strokeDashoffset={-acumulado}
          />
        );
        acumulado += largo;
        return el;
      })}
    </svg>
  );
}

export default async function NegocioPage({ searchParams }: { searchParams: { rango?: string } }) {
  const rango = rangoDeParams(searchParams);
  const n = await getNegocio(desdeDe(rango));
  const porTipo = TIPOS.map((t) => ({ ...t, ...(n.porTipo.find((p) => p.tipo === t.tipo) ?? { contratas: 0, capital: 0 }) }));
  const totalContratas = porTipo.reduce((s, t) => s + t.contratas, 0);
  const cobradoTotal = n.cobradoPorDia.reduce((s, d) => s + d.total, 0);
  const periodo = ETIQUETA_RANGO[rango];
  const top = n.espacios.filter((e) => e.contratas > 0 || e.movimientos > 0);

  return (
    <>
      <Encabezado titulo="Métricas de negocio" subtitulo={`Todos los usuarios de la plataforma · ${periodo}`} />

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <KpiSimple titulo="Cartera activa" icono="account_balance" valor={dineroCorto(n.cartera)} pie="saldo por cobrar de contratas activas" tono="text-secondary" />
        <KpiSimple titulo="Deuda viva" icono="money_off" valor={dineroCorto(n.deudaViva)} pie="deudores: deuda menos abonos" tono="text-tertiary" />
        <KpiSimple titulo="Entregado" icono="payments" valor={dineroCorto(n.entregadas.monto)} pie={`capital entregado · ${periodo}`} tono="text-primary" />
        <KpiSimple titulo="Contratas entregadas" icono="description" valor={numero(n.entregadas.cantidad)} pie={periodo} />
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <Tarjeta className="xl:col-span-8">
          <div className="mb-space-md flex items-center justify-between">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Cobrado por día</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Abonos registrados en cuotas · {periodo}</p>
            </div>
            <span className="rounded bg-surface-container-high px-2.5 py-1 font-code-sm text-code-sm text-secondary">{dinero(cobradoTotal)}</span>
          </div>
          <Barras datos={n.cobradoPorDia} />
        </Tarjeta>

        <Tarjeta className="xl:col-span-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Contratas por tipo</h2>
          <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">Contratas activas en todos los espacios</p>
          <div className="flex items-center gap-space-lg">
            <div className="relative">
              <Dona partes={porTipo.map((t) => ({ valor: t.contratas, color: t.color }))} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-metric-num text-metric-num text-on-surface">{numero(totalContratas)}</span>
                <span className="font-label-xs text-label-xs uppercase text-outline">activas</span>
              </div>
            </div>
            <ul className="flex flex-1 flex-col gap-space-sm">
              {porTipo.map((t) => (
                <li key={t.tipo} className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-title-md text-title-md text-on-surface">
                      <span className={`h-2 w-2 rounded-full ${t.punto}`} />
                      {t.texto}
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface">
                      {totalContratas ? Math.round((t.contratas / totalContratas) * 100) : 0}%
                    </span>
                  </div>
                  <span className="font-label-xs text-label-xs text-on-surface-variant">
                    {numero(t.contratas)} contratas · {dineroCorto(t.capital)} prestado
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta>
        <h2 className="mb-space-md font-headline-sm text-headline-sm text-on-surface">Cartera por usuario</h2>
        {top.length === 0 ? (
          <Vacio texto="Sin datos." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                  <th className="rounded-l px-2.5 py-2">Usuario</th>
                  <th className="px-2 py-2 text-right">Contratas activas</th>
                  <th className="px-2 py-2 text-right">Clientes</th>
                  <th className="px-2 py-2">Participación</th>
                  <th className="rounded-r px-2.5 py-2 text-right">Movimientos</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm">
                {top.map((u) => {
                  const pct = totalContratas ? (u.contratas / totalContratas) * 100 : 0;
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-surface-container/60">
                      <td className="px-2.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-variant font-label-sm text-label-sm font-semibold text-on-surface">
                            {iniciales(u.nombre)}
                          </div>
                          <span className="truncate font-title-md text-title-md text-on-surface">{u.nombre}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{numero(u.contratas)}</td>
                      <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{numero(u.clientes)}</td>
                      <td className="w-56 px-2 py-2.5">
                        <div className="flex items-center gap-space-sm">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-lowest">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, pct)}%` }} />
                          </div>
                          <span className="w-10 text-right font-code-sm text-code-sm text-on-surface-variant">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-code-sm text-code-sm text-secondary">{numero(u.movimientos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
