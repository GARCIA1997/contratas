import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { desdeDe, getActividad, type EventoActividad } from "@/lib/monitor/datos";
import { hora } from "@/components/monitor/formato";
import { Chips, Encabezado, Tarjeta, Vacio } from "@/components/monitor/ui";
import { cn } from "@/lib/utils";
import { ETIQUETA_RANGO, rangoDeParams } from "../../_rango";

export const dynamic = "force-dynamic";

const ESTILO: Record<EventoActividad["tipo"], { icono: string; clase: string; etiqueta: string }> = {
  movimiento: { icono: "sync_alt", clase: "bg-on-primary-container text-primary", etiqueta: "Movimiento" },
  auditoria: { icono: "shield", clase: "bg-tertiary-container/30 text-tertiary", etiqueta: "Auditoría" },
  login: { icono: "login", clase: "bg-secondary-container/20 text-secondary", etiqueta: "Sesión" },
  error: { icono: "error", clase: "bg-error-container/30 text-error", etiqueta: "Error" },
};

function dia(iso: string) {
  const d = new Date(iso);
  const largo = format(d, "EEEE d 'de' MMMM", { locale: es });
  if (isToday(d)) return `Hoy — ${largo}`;
  if (isYesterday(d)) return `Ayer — ${largo}`;
  return largo.charAt(0).toUpperCase() + largo.slice(1);
}

export default async function ActividadPage({
  searchParams,
}: {
  searchParams: { rango?: string; tipo?: string; q?: string };
}) {
  const rango = rangoDeParams(searchParams);
  const tipo = searchParams.tipo ?? "";
  const eventos = await getActividad({
    desde: desdeDe(rango),
    tipo: tipo || undefined,
    q: searchParams.q,
  });
  const grupos = new Map<string, EventoActividad[]>();
  for (const e of eventos) {
    const k = e.creadoEn.slice(0, 10);
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }

  return (
    <>
      <Encabezado
        titulo="Bitácora de actividad"
        subtitulo={`Movimientos, auditoría, inicios de sesión y errores de todos los usuarios · ${ETIQUETA_RANGO[rango]}${searchParams.q ? ` · "${searchParams.q}"` : ""}`}
      >
        <Chips
          base="/monitor/actividad"
          param="tipo"
          activo={tipo}
          extra={{ rango, q: searchParams.q }}
          opciones={[
            { valor: "", texto: "Todo" },
            { valor: "movimiento", texto: "Movimientos" },
            { valor: "auditoria", texto: "Auditoría" },
            { valor: "login", texto: "Inicios de sesión" },
            { valor: "error", texto: "Errores" },
          ]}
        />
      </Encabezado>

      <Tarjeta>
        {eventos.length === 0 ? (
          <Vacio texto="Sin actividad con estos filtros." />
        ) : (
          <div className="flex flex-col gap-space-lg">
            {Array.from(grupos.entries()).map(([k, lista]) => (
              <section key={k}>
                <h3 className="mb-space-sm flex items-center gap-space-sm font-label-xs text-label-xs uppercase tracking-wider text-outline">
                  <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                  {dia(lista[0]!.creadoEn)}
                  <span className="rounded bg-surface-container px-1.5 font-code-sm text-code-sm normal-case">{lista.length}</span>
                </h3>
                <ol className="flex flex-col gap-1">
                  {lista.map((e) => {
                    const s = ESTILO[e.tipo];
                    return (
                      <li
                        key={e.id}
                        className="grid grid-cols-[72px_28px_minmax(0,1fr)_minmax(0,180px)_12px] items-center gap-space-sm rounded-lg bg-surface-container px-space-sm py-1.5 transition-colors hover:bg-surface-container-high"
                      >
                        <span className="font-code-sm text-code-sm text-on-surface-variant">{hora(e.creadoEn)}</span>
                        <span className={cn("flex h-6 w-6 items-center justify-center rounded", s.clase)} title={s.etiqueta}>
                          <span className="material-symbols-outlined text-[15px]">{s.icono}</span>
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-title-md text-title-md text-on-surface">{e.titulo}</div>
                          {e.detalle && <div className="truncate font-code-sm text-code-sm text-outline">{e.detalle}</div>}
                        </div>
                        <span className="truncate text-right font-body-sm text-body-sm text-on-surface-variant">{e.usuario}</span>
                        <span
                          className={cn("h-2 w-2 rounded-full", e.ok ? "bg-secondary" : "bg-error")}
                          title={e.ok ? "Correcto" : "Falló"}
                        />
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Tarjeta>
    </>
  );
}
