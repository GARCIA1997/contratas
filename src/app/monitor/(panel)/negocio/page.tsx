import { format } from "date-fns";
import { es } from "date-fns/locale";
import { desdeDe, getNegocio } from "@/lib/monitor/datos";
import { dinero, dineroCorto, fechaHora, iniciales, numero } from "@/components/monitor/formato";
import { Encabezado, KpiSimple, Tarjeta, Vacio } from "@/components/monitor/ui";
import { cn } from "@/lib/utils";
import { ETIQUETA_RANGO, rangoDeParams } from "../../_rango";

export const dynamic = "force-dynamic";

const TIPOS = [
  { tipo: "SEMANAL", texto: "Semanal", color: "#4c8eff", punto: "bg-primary-container" },
  { tipo: "QUINCENAL", texto: "Quincenal", color: "#4edea3", punto: "bg-secondary" },
  { tipo: "MENSUAL", texto: "Mensual", color: "#ffb95f", punto: "bg-tertiary" },
] as const;

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

/** Color del % de mora: verde < 10, ámbar < 25, rojo arriba. */
function claseMora(p: number) {
  return p < 10 ? "text-secondary" : p < 25 ? "text-tertiary" : "text-error";
}

/** Cobrado vs esperado por día (dos barras por día). */
function Cobranza({
  cobrado,
  esperado,
}: {
  cobrado: { dia: string; total: number }[];
  esperado: { dia: string; total: number }[];
}) {
  const dias = Array.from(new Set([...cobrado, ...esperado].map((d) => d.dia.slice(0, 10)))).sort();
  if (dias.length === 0) return <Vacio texto="Sin cobros ni cuotas programadas en el periodo." />;
  const c = new Map(cobrado.map((d) => [d.dia.slice(0, 10), d.total]));
  const e = new Map(esperado.map((d) => [d.dia.slice(0, 10), d.total]));
  const max = Math.max(...dias.map((d) => Math.max(c.get(d) ?? 0, e.get(d) ?? 0)), 1);
  const ancho = 800 / dias.length;
  const cada = Math.max(1, Math.ceil(dias.length / 8));
  return (
    <svg className="h-64 w-full" preserveAspectRatio="none" viewBox="0 0 820 240">
      {[0, 0.25, 0.5, 0.75].map((f) => (
        <line key={f} stroke="#2e3544" strokeDasharray="4 4" strokeWidth="0.75" x1="10" x2="810" y1={20 + f * 190} y2={20 + f * 190} />
      ))}
      <line stroke="#2e3544" x1="10" x2="810" y1="210" y2="210" />
      {dias.map((d, i) => {
        const x = 10 + i * ancho;
        const w = Math.max(2, ancho * 0.35);
        const hE = ((e.get(d) ?? 0) / max) * 185;
        const hC = ((c.get(d) ?? 0) / max) * 185;
        const etiqueta = format(new Date(`${d}T12:00:00`), "d MMM", { locale: es });
        return (
          <g key={d}>
            <rect x={x + ancho * 0.12} y={210 - hE} width={w} height={hE} rx="3" fill="#2e3544">
              <title>{`${etiqueta} · esperado ${dinero(e.get(d) ?? 0)}`}</title>
            </rect>
            <rect x={x + ancho * 0.12 + w} y={210 - hC} width={w} height={hC} rx="3" fill="#4edea3">
              <title>{`${etiqueta} · cobrado ${dinero(c.get(d) ?? 0)}`}</title>
            </rect>
            {i % cada === 0 && (
              <text x={x + ancho * 0.45} y="230" fill="#8b90a0" fontFamily="JetBrains Mono" fontSize="10" textAnchor="middle">
                {etiqueta}
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
    <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
      <circle cx="70" cy="70" r={R} fill="none" stroke="#19202e" strokeWidth="18" />
      {partes.map((p, i) => {
        const largo = (p.valor / total) * C;
        const el = (
          <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${largo} ${C - largo}`} strokeDashoffset={-acumulado} />
        );
        acumulado += largo;
        return el;
      })}
    </svg>
  );
}

function Dato({ etiqueta, valor, tono = "text-on-surface" }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-container px-space-sm py-space-sm">
      <span className="font-body-sm text-body-sm text-on-surface-variant">{etiqueta}</span>
      <span className={cn("font-code-sm text-code-sm font-semibold", tono)}>{valor}</span>
    </div>
  );
}

export default async function NegocioPage({ searchParams }: { searchParams: { rango?: string } }) {
  const rango = rangoDeParams(searchParams);
  const n = await getNegocio(desdeDe(rango));
  const periodo = ETIQUETA_RANGO[rango];
  const porTipo = TIPOS.map((t) => ({ ...t, ...(n.porTipo.find((p) => p.tipo === t.tipo) ?? { contratas: 0, capital: 0, saldo: 0 }) }));
  const totalTipo = porTipo.reduce((s, t) => s + t.contratas, 0);
  const maxMora = Math.max(...n.mora.antiguedad.map((a) => a.monto), 1);
  const cumplimiento = n.cobranza.cumplimiento;

  return (
    <>
      <Encabezado
        titulo="Métricas de negocio"
        subtitulo={`Todos los usuarios de la plataforma · ${periodo}. Mismos cálculos que el panel de la app.`}
      />

      {n.anomalas.length > 0 && (
        <div className="flex items-start gap-space-sm rounded-xl bg-tertiary-container/20 px-space-md py-space-sm">
          <span className="material-symbols-outlined text-[20px] text-tertiary">warning</span>
          <p className="font-body-sm text-body-sm text-on-surface">
            {n.anomalas.length === 1 ? "1 contrata tiene" : `${n.anomalas.length} contratas tienen`} montos imposibles (abono
            mayor que lo prestado) y {n.anomalas.length === 1 ? "queda" : "quedan"} fuera de todas las cifras hasta corregirse.
            Ver el detalle al final de la página.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
        <KpiSimple titulo="Cartera activa" icono="account_balance" valor={dineroCorto(n.cartera)} pie={`${numero(n.contratasActivas)} contratas por cobrar`} tono="text-secondary" />
        <KpiSimple titulo="Capital prestado" icono="savings" valor={dineroCorto(n.capitalActivo)} pie="en contratas activas" />
        <KpiSimple titulo="Intereses por cobrar" icono="trending_up" valor={dineroCorto(n.interesesPorCobrar)} pie="ganancia dentro de la cartera" tono="text-primary" />
        <KpiSimple titulo="Cartera vencida" icono="schedule" valor={dineroCorto(n.mora.vencido)} pie={`${pct(n.mora.porcentaje)} de mora · ${numero(n.contratasConVencido)} contratas`} tono={claseMora(n.mora.porcentaje)} />
        <KpiSimple titulo="Cobrado" icono="payments" valor={dineroCorto(n.cobranza.cobrado)} pie={`${pct(cumplimiento)} de lo esperado · ${periodo}`} tono="text-secondary" />
        <KpiSimple titulo="Ganancia cobrada" icono="paid" valor={dineroCorto(n.cobranza.ganancia)} pie={`interés dentro de lo cobrado · ${periodo}`} tono="text-primary" />
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <Tarjeta className="xl:col-span-8">
          <div className="mb-space-md flex flex-col justify-between gap-space-sm md:flex-row md:items-center">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Cobranza: cobrado vs esperado</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Esperado = abono de las cuotas que vencían cada día · {periodo}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <span className="flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-1 font-code-sm text-code-sm text-on-surface">
                <span className="h-2 w-2 rounded-full bg-[#2e3544] ring-1 ring-outline" /> Esperado {dineroCorto(n.cobranza.esperado)}
              </span>
              <span className="flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-1 font-code-sm text-code-sm text-on-surface">
                <span className="h-2 w-2 rounded-full bg-secondary" /> Cobrado {dineroCorto(n.cobranza.cobrado)}
              </span>
            </div>
          </div>
          <Cobranza cobrado={n.cobradoPorDia} esperado={n.esperadoPorDia} />
          <div className="mt-space-sm grid grid-cols-2 gap-space-sm md:grid-cols-4">
            <Dato etiqueta="Cumplimiento" valor={pct(cumplimiento)} tono={cumplimiento !== null && cumplimiento >= 80 ? "text-secondary" : "text-tertiary"} />
            <Dato etiqueta="Pagos registrados" valor={numero(n.cobranza.pagos)} />
            <Dato etiqueta="Por cobrar 7 días" valor={dineroCorto(n.proximos.dias7)} />
            <Dato etiqueta="Por cobrar 30 días" valor={dineroCorto(n.proximos.dias30)} />
          </div>
        </Tarjeta>

        <Tarjeta className="xl:col-span-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Mora por antigüedad</h2>
          <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">
            Saldo de cuotas vencidas, según cuántos días llevan sin pagarse
          </p>
          <div className="flex flex-col gap-space-sm">
            {n.mora.antiguedad.map((a, i) => (
              <div key={a.rango}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-body-sm text-body-sm text-on-surface">{a.rango}</span>
                  <span className="font-code-sm text-code-sm text-on-surface">{dinero(a.monto)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-lowest">
                  <div
                    className={cn("h-full rounded-full", ["bg-tertiary", "bg-tertiary-container", "bg-error", "bg-error-container"][i])}
                    style={{ width: `${(a.monto / maxMora) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-space-md flex flex-col gap-space-xs">
            <Dato etiqueta="Total vencido" valor={dinero(n.mora.vencido)} tono={claseMora(n.mora.porcentaje)} />
            <Dato etiqueta="% de la cartera" valor={pct(n.mora.porcentaje)} tono={claseMora(n.mora.porcentaje)} />
          </div>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg md:grid-cols-2 xl:grid-cols-3">
        <Tarjeta>
          <div className="mb-space-md flex items-center justify-between">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Colocación</h2>
            <span className="material-symbols-outlined text-[18px] text-outline">rocket_launch</span>
          </div>
          <span className="font-display-lg text-display-lg text-on-surface">{dineroCorto(n.entregadas.monto)}</span>
          <span className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">entregado · {periodo}</span>
          <div className="flex flex-col gap-space-xs">
            <Dato etiqueta="Contratas entregadas" valor={numero(n.entregadas.cantidad)} />
            <Dato etiqueta="Ticket promedio" valor={dinero(n.entregadas.ticketPromedio)} />
            <Dato etiqueta="Clientes atendidos" valor={numero(n.entregadas.clientes)} />
          </div>
        </Tarjeta>

        <Tarjeta>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Contratas activas por tipo</h2>
          <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">Con cuotas pendientes</p>
          <div className="flex items-center gap-space-md">
            <div className="relative shrink-0">
              <Dona partes={porTipo.map((t) => ({ valor: t.contratas, color: t.color }))} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-metric-num text-metric-num text-on-surface">{numero(totalTipo)}</span>
                <span className="font-label-xs text-label-xs uppercase text-outline">activas</span>
              </div>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-space-sm">
              {porTipo.map((t) => (
                <li key={t.tipo} className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-title-md text-title-md text-on-surface">
                      <span className={`h-2 w-2 rounded-full ${t.punto}`} />
                      {t.texto}
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface">
                      {totalTipo ? Math.round((t.contratas / totalTipo) * 100) : 0}%
                    </span>
                  </div>
                  <span className="font-label-xs text-label-xs text-on-surface-variant">
                    {numero(t.contratas)} · por cobrar {dineroCorto(t.saldo)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Tarjeta>

        <Tarjeta>
          <div className="mb-space-md flex items-center justify-between">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Deudores</h2>
            <span className="material-symbols-outlined text-[18px] text-outline">money_off</span>
          </div>
          <span className="font-display-lg text-display-lg text-tertiary">{dineroCorto(n.deudores.deudaViva)}</span>
          <span className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">deuda viva (deuda menos abonos)</span>
          <div className="flex flex-col gap-space-xs">
            <Dato etiqueta="Deudores con saldo" valor={numero(n.deudores.conSaldo)} />
            <Dato etiqueta={`Abonado · ${periodo}`} valor={dinero(n.deudores.abonadoPeriodo)} tono="text-secondary" />
          </div>
        </Tarjeta>
      </div>

      <Tarjeta>
        <h2 className="mb-space-md font-headline-sm text-headline-sm text-on-surface">Cartera por usuario</h2>
        {n.espacios.length === 0 ? (
          <Vacio texto="Sin datos." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                  <th className="rounded-l px-2.5 py-2">Usuario</th>
                  <th className="px-2 py-2 text-right">Activas</th>
                  <th className="px-2 py-2 text-right">Cartera</th>
                  <th className="px-2 py-2 text-right">Vencido</th>
                  <th className="px-2 py-2 text-right">Mora</th>
                  <th className="px-2 py-2 text-right">Cobrado</th>
                  <th className="px-2 py-2 text-right">Entregado</th>
                  <th className="rounded-r px-2.5 py-2">Participación</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm">
                {n.espacios.map((u) => {
                  const part = n.cartera > 0 ? (u.cartera / n.cartera) * 100 : 0;
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-surface-container/60">
                      <td className="px-2.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-variant font-label-sm text-label-sm font-semibold text-on-surface">
                            {iniciales(u.nombre)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-title-md text-title-md text-on-surface">{u.nombre}</div>
                            <div className="font-label-xs text-label-xs text-on-surface-variant">{numero(u.clientes)} clientes</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{numero(u.activas)}</td>
                      <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{dinero(u.cartera)}</td>
                      <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface-variant">{dinero(u.vencido)}</td>
                      <td className={cn("px-2 py-2.5 text-right font-code-sm text-code-sm font-semibold", claseMora(u.mora))}>{pct(u.mora)}</td>
                      <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-secondary">{dinero(u.cobrado)}</td>
                      <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-primary">{dinero(u.entregado)}</td>
                      <td className="w-40 px-2.5 py-2.5">
                        <div className="flex items-center gap-space-sm">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-lowest">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, part)}%` }} />
                          </div>
                          <span className="w-9 text-right font-code-sm text-code-sm text-on-surface-variant">{part.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {n.anomalas.length > 0 && (
        <Tarjeta>
          <div className="mb-space-md flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[20px] text-tertiary">report</span>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Contratas con montos a revisar</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Abono por pago mayor que lo prestado: casi seguro un error al teclear. Se corrigen desde la app (Editar contrata).
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                  <th className="rounded-l px-2.5 py-2">Usuario</th>
                  <th className="px-2 py-2">Cliente</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2 text-right">Prestado</th>
                  <th className="px-2 py-2 text-right">Abono</th>
                  <th className="px-2 py-2 text-right">Total a pagar</th>
                  <th className="rounded-r px-2.5 py-2">Creada</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm">
                {n.anomalas.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-surface-container/60">
                    <td className="px-2.5 py-2.5 text-on-surface">{a.espacio ?? "—"}</td>
                    <td className="px-2 py-2.5 text-on-surface">{a.cliente}</td>
                    <td className="px-2 py-2.5 text-on-surface-variant">{a.tipo.toLowerCase()} · {a.numCuotas} pagos</td>
                    <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{dinero(a.monto)}</td>
                    <td className="px-2 py-2.5 text-right font-code-sm text-code-sm font-semibold text-error">{dinero(a.abono)}</td>
                    <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-error">{dinero(a.abono * a.numCuotas)}</td>
                    <td className="px-2.5 py-2.5 font-code-sm text-code-sm text-on-surface-variant">{fechaHora(a.creadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </>
  );
}
