import Link from "next/link";
import { getResumen, getResumenCalidad } from "@/lib/monitor/datos";
import { GraficaActividad, Sparkline } from "@/components/monitor/graficas";
import { dineroCorto, haceCuanto, hora, iniciales, numero, origenError } from "@/components/monitor/formato";
import { cn } from "@/lib/utils";
import { ETIQUETA_RANGO, rangoDeParams } from "../_rango";

export const dynamic = "force-dynamic";

function Cambio({ valor, invertido = false }: { valor: number | null; invertido?: boolean }) {
  if (valor === null) return null;
  // Para errores, bajar es bueno (verde); para el resto, subir es bueno.
  const bueno = invertido ? valor <= 0 : valor >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-label-xs text-label-xs",
        bueno ? "bg-secondary-container/20 text-secondary" : "bg-error-container/30 text-error"
      )}
    >
      {valor > 0 ? "+" : ""}
      {valor}%
    </span>
  );
}

function Kpi(props: {
  titulo: string;
  icono: string;
  valor: string;
  cambio: number | null;
  invertido?: boolean;
  pie: string;
  serie: number[];
  color: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-container-low p-space-md transition-all duration-200 hover:bg-surface-container">
      <div className="mb-1 flex items-center justify-between gap-space-xs">
        <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline">{props.titulo}</span>
        <span className="material-symbols-outlined text-[16px] text-outline">{props.icono}</span>
      </div>
      <div className="my-1 flex items-baseline justify-between gap-2">
        <span className="font-metric-num text-metric-num text-on-surface">{props.valor}</span>
        <Cambio valor={props.cambio} invertido={props.invertido} />
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="font-label-xs text-label-xs text-on-surface-variant">{props.pie}</span>
        <Sparkline valores={props.serie} clase={props.color} />
      </div>
    </div>
  );
}

function Servicio(props: { ok: boolean; aviso?: boolean; nombre: string; detalle: string; dato: string; estado: string }) {
  // Clases escritas completas: Tailwind solo genera las que ve literalmente.
  const c = !props.ok
    ? { punto: "bg-error", texto: "text-error" }
    : props.aviso
      ? { punto: "bg-tertiary", texto: "text-tertiary" }
      : { punto: "bg-secondary", texto: "text-secondary" };
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-container p-space-sm transition-colors hover:bg-surface-container-high">
      <div className="flex min-w-0 items-center gap-space-sm">
        <span className={`h-2 w-2 rounded-full ${c.punto}`} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-title-md text-title-md text-on-surface">{props.nombre}</span>
          <span className="font-label-xs text-label-xs text-on-surface-variant">{props.detalle}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-space-sm">
        <span className={`rounded bg-surface-container-lowest px-2 py-0.5 font-code-sm text-code-sm ${c.texto}`}>
          {props.dato}
        </span>
        <span className={`font-label-xs text-label-xs font-medium ${c.texto}`}>{props.estado}</span>
      </div>
    </div>
  );
}

export default async function ResumenPage({ searchParams }: { searchParams: { rango?: string } }) {
  const rango = rangoDeParams(searchParams);
  const [r, calidad] = await Promise.all([getResumen(rango), getResumenCalidad()]);
  const k = r.kpis;
  const movs = r.serie.map((p) => p.movimientos);
  const errs = r.serie.map((p) => p.errores);
  const pico = r.serie.reduce((m, p) => (p.movimientos > m.movimientos ? p : m), r.serie[0] ?? { t: r.generadoEn, movimientos: 0, errores: 0 });
  const totalMov = movs.reduce((s, n) => s + n, 0);
  const totalErr = errs.reduce((s, n) => s + n, 0);
  const tasaFallo = totalMov + totalErr > 0 ? (totalErr / (totalMov + totalErr)) * 100 : 0;
  const maxMovEspacio = Math.max(...r.espacios.map((e) => e.movimientos), 1);
  const totalLogins = r.logins.exitosos + r.logins.fallidos;
  const porHora = rango === "hoy";
  const periodo = ETIQUETA_RANGO[rango];

  return (
    <>
      {/* Sub-header */}
      <div className="flex flex-col justify-between gap-space-sm rounded-xl bg-surface-container-low px-space-md py-space-sm lg:flex-row lg:items-center">
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-secondary" />
            <span className="font-headline-sm text-headline-sm text-on-surface">Panel de control operativo</span>
          </div>
          <div className="hidden items-center gap-space-xs rounded-full bg-surface-container-high px-2.5 py-0.5 font-code-sm text-code-sm text-primary sm:inline-flex">
            <span>Periodo: {periodo}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi titulo="Usuarios activos" icono="group" valor={numero(k.usuariosActivos.valor)} cambio={k.usuariosActivos.cambio} pie="espacios con movimientos" serie={movs} color="text-secondary" />
        <Kpi titulo="Errores" icono="warning" valor={numero(k.errores.valor)} cambio={k.errores.cambio} invertido pie={`${tasaFallo.toFixed(2)}% de fallo`} serie={errs} color="text-tertiary" />
        <Kpi titulo="Movimientos" icono="sync_alt" valor={numero(k.movimientos.valor)} cambio={k.movimientos.cambio} pie="cobros, entregas, citas…" serie={movs} color="text-primary" />
        <Kpi titulo="Cobrado" icono="attach_money" valor={dineroCorto(k.cobrado.valor)} cambio={k.cobrado.cambio} pie={periodo} serie={movs} color="text-secondary" />
        <Kpi titulo="Contratas entregadas" icono="description" valor={numero(k.entregadas.valor)} cambio={k.entregadas.cambio} pie={periodo} serie={movs} color="text-primary" />
        <Kpi titulo="Cartera activa" icono="account_balance" valor={dineroCorto(k.cartera.valor)} cambio={null} pie="saldo por cobrar" serie={movs} color="text-secondary" />
      </div>

      {/* Actividad + Salud */}
      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="flex flex-col rounded-xl bg-surface-container-low p-space-lg xl:col-span-8">
          <div className="mb-space-md flex flex-col justify-between gap-space-md md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-space-xs">
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  {porHora ? "Actividad por hora" : "Actividad por día"}
                </h2>
                <span className="rounded bg-surface-container px-2 py-0.5 font-label-xs text-label-xs font-medium text-secondary">
                  En vivo
                </span>
              </div>
              <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                Movimientos registrados y errores reportados ({periodo})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <div className="flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-primary-container" />
                <span className="font-code-sm text-code-sm text-on-surface">Movimientos</span>
              </div>
              <div className="flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-error" />
                <span className="font-code-sm text-code-sm text-on-surface">Errores</span>
              </div>
            </div>
          </div>
          <div className="mb-space-md flex flex-wrap items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-sm font-code-sm text-code-sm text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-primary">trending_up</span>
              <span className="font-semibold text-on-surface">Pico:</span>
              <span>
                {pico.movimientos} movs{" "}
                {pico.movimientos > 0 &&
                  (porHora
                    ? `a las ${new Date(pico.t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                    : `el ${new Date(pico.t).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`)}
              </span>
            </div>
            <div className="h-3 w-px bg-outline-variant" />
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-secondary">check_circle</span>
              <span className="font-semibold text-on-surface">Tasa de fallo:</span>
              <span className={cn("font-semibold", tasaFallo > 5 ? "text-error" : "text-secondary")}>
                {tasaFallo.toFixed(2)}%
              </span>
            </div>
            <div className="h-3 w-px bg-outline-variant" />
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-tertiary">schedule</span>
              <span>Latencia BD: {r.salud.latenciaDb}ms</span>
            </div>
          </div>
          <GraficaActividad serie={r.serie} porHora={porHora} />
        </div>

        <div className="flex h-full flex-col justify-between rounded-xl bg-surface-container-low p-space-lg xl:col-span-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Salud del sistema</h2>
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 font-label-xs text-label-xs",
                  r.salud.db ? "bg-secondary-container/20 text-secondary" : "bg-error-container/30 text-error"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", r.salud.db ? "bg-secondary" : "bg-error")} />
                {r.salud.db ? "Operativo" : "Falla"}
              </span>
            </div>
            <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">
              Estado de los servicios de los que depende la app
            </p>
            <div className="flex flex-col gap-space-xs">
              <Servicio ok={r.salud.db} nombre="Base de datos (PostgreSQL)" detalle="Consulta de prueba" dato={`${r.salud.latenciaDb}ms`} estado={r.salud.db ? "Operativo" : "Sin respuesta"} />
              <Servicio ok nombre="API de la app" detalle="Respondió a este monitor" dato="200 OK" estado="Operativo" />
              <Servicio
                ok
                aviso={r.salud.operacionesAtoradas > 0}
                nombre="Operaciones en curso"
                detalle="Escrituras reservadas sin terminar (>2 min)"
                dato={`${r.salud.operacionesAtoradas} atoradas`}
                estado={r.salud.operacionesAtoradas > 0 ? "Revisar" : "Operativo"}
              />
              <Link href={`/monitor/calidad?rango=${rango}`} className="block">
                <Servicio
                  ok={calidad.errores === 0}
                  aviso={calidad.avisos > 0}
                  nombre="Calidad de datos"
                  detalle="Contratas, cuotas, clientes y deudores"
                  dato={`${calidad.errores} errores`}
                  estado={calidad.errores > 0 ? "Revisar" : calidad.avisos > 0 ? `${calidad.avisos} avisos` : "Sin hallazgos"}
                />
              </Link>
              <Servicio
                ok
                aviso={r.salud.erroresUltimaHora > 0}
                nombre="Errores en la última hora"
                detalle="Teléfonos, servidor y cola"
                dato={`${r.salud.erroresUltimaHora}`}
                estado={r.salud.erroresUltimaHora > 0 ? "Con errores" : "Sin errores"}
              />
            </div>
          </div>
          <div className="mt-space-md flex items-center justify-between rounded-lg bg-surface-container-lowest p-space-sm">
            <div className="flex items-center gap-space-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high text-primary">
                <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-code-sm text-code-sm font-semibold text-on-surface">v{r.salud.version}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                  <span className="font-label-xs text-label-xs text-secondary">En producción</span>
                </div>
                <span className="font-label-xs text-label-xs text-on-surface-variant">Versión desplegada</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Errores · Usuarios · Logins */}
      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="flex flex-col rounded-xl bg-surface-container-low p-space-lg xl:col-span-5">
          <div className="mb-space-md flex items-center justify-between">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Errores recientes</h2>
              <span className="font-label-xs text-label-xs text-on-surface-variant">Agrupados por mensaje</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-error-container/30 px-2 py-0.5 font-code-sm text-code-sm text-error">
                {k.errores.valor} en el periodo
              </span>
              <Link href={`/monitor/errores?rango=${rango}`} className="flex items-center gap-0.5 font-label-xs text-label-xs text-primary hover:underline">
                Ver todos <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>
          {r.erroresRecientes.length === 0 ? (
            <p className="py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Sin errores en el periodo 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                    <th className="rounded-l px-2.5 py-2">Hora</th>
                    <th className="px-2 py-2">Origen</th>
                    <th className="px-2 py-2">Mensaje</th>
                    <th className="px-2 py-2">Usuario</th>
                    <th className="rounded-r px-2.5 py-2 text-right">Veces</th>
                  </tr>
                </thead>
                <tbody className="font-body-sm text-body-sm">
                  {r.erroresRecientes.map((e) => {
                    const o = origenError(e.origen);
                    return (
                      <tr key={e.id} className="transition-colors hover:bg-surface-container/60">
                        <td className="px-2.5 py-2.5 font-code-sm text-code-sm text-on-surface-variant">{hora(e.ultimo)}</td>
                        <td className="px-2 py-2.5">
                          <span className={`inline-flex rounded px-1.5 py-0.5 font-label-xs text-label-xs ${o.clase}`}>{o.etiqueta}</span>
                        </td>
                        <td className="max-w-[170px] px-2 py-2.5">
                          <Link href={`/monitor/errores?rango=${rango}&id=${e.id}`} className="block truncate font-code-sm text-code-sm text-on-surface hover:text-primary">
                            {e.mensaje}
                          </Link>
                          <div className="truncate font-label-xs text-label-xs text-on-surface-variant">{e.url ?? "—"}</div>
                        </td>
                        <td className="max-w-[90px] truncate px-2 py-2.5 font-code-sm text-code-sm text-on-surface-variant">{e.usuarios[0]}</td>
                        <td className="px-2.5 py-2.5 text-right font-code-sm text-code-sm font-semibold text-error">{e.veces}x</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col rounded-xl bg-surface-container-low p-space-lg xl:col-span-4">
          <div className="mb-space-md flex items-center justify-between">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Usuarios más activos</h2>
              <span className="font-label-xs text-label-xs text-on-surface-variant">Espacios de trabajo · {periodo}</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-outline">leaderboard</span>
          </div>
          <div className="flex flex-col gap-space-sm">
            {r.espacios.map((u, i) => (
              <div key={u.id} className="flex flex-col rounded-lg bg-surface-container p-space-xs transition-colors hover:bg-surface-container-high">
                <div className="flex items-center justify-between gap-space-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn("w-4 font-code-sm text-code-sm font-bold", i === 0 ? "text-primary" : "text-on-surface-variant")}>#{i + 1}</span>
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-title-md text-title-md font-semibold",
                        i === 0 ? "bg-primary-container text-on-primary-container" : "bg-surface-variant text-on-surface"
                      )}
                    >
                      {iniciales(u.nombre)}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-title-md text-title-md text-on-surface">{u.nombre}</span>
                      <span className="font-label-xs text-label-xs text-on-surface-variant">
                        {u.contratas} contratas · {u.miembros} miembros
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className={cn("font-code-sm text-code-sm font-bold", i === 0 ? "text-secondary" : "text-on-surface")}>
                      {u.movimientos} movs
                    </span>
                    <span className="font-label-xs text-label-xs text-on-surface-variant">{haceCuanto(u.ultimaVez)}</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-lowest">
                  <div
                    className={cn("h-full rounded-full", i === 0 ? "bg-secondary" : i < 3 ? "bg-primary" : "bg-outline-variant")}
                    style={{ width: `${Math.max(2, (u.movimientos / maxMovEspacio) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-full flex-col justify-between rounded-xl bg-surface-container-low p-space-lg xl:col-span-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Inicios de sesión</h2>
              <span className="material-symbols-outlined text-[18px] text-outline">fingerprint</span>
            </div>
            <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">Intentos de acceso a la app · {periodo}</p>
            <div className="mb-space-md flex items-end justify-between">
              <span className="font-display-lg text-display-lg text-on-surface">{numero(totalLogins)}</span>
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline">Total intentos</span>
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              <div className="rounded-lg bg-surface-container p-space-sm">
                <span className="font-label-xs text-label-xs text-secondary">Exitosos</span>
                <div className="font-headline-sm text-headline-sm text-on-surface">{numero(r.logins.exitosos)}</div>
                <span className="font-code-sm text-code-sm text-secondary">
                  {totalLogins ? ((r.logins.exitosos / totalLogins) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
              <div className="rounded-lg bg-surface-container p-space-sm">
                <span className="font-label-xs text-label-xs text-error">Fallidos</span>
                <div className="font-headline-sm text-headline-sm text-on-surface">{numero(r.logins.fallidos)}</div>
                <span className="font-code-sm text-code-sm text-error">
                  {totalLogins ? ((r.logins.fallidos / totalLogins) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            </div>
          </div>
          <Link
            href={`/monitor/actividad?rango=${rango}&tipo=login`}
            className="mt-space-md flex items-center gap-space-sm rounded-lg bg-surface-container-lowest p-space-sm font-label-xs text-label-xs text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">verified_user</span>
            Ver el detalle de los inicios de sesión
          </Link>
        </div>
      </div>
    </>
  );
}
