import { getCalidadDatos, type Severidad } from "@/lib/monitor/datos";
import { fechaHora, numero } from "@/components/monitor/formato";
import { Chips, Encabezado, KpiSimple } from "@/components/monitor/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ESTILO: Record<Severidad, { etiqueta: string; icono: string; badge: string; borde: string; tono: string }> = {
  error: {
    etiqueta: "Error",
    icono: "error",
    badge: "bg-error-container/30 text-error",
    borde: "shadow-[inset_3px_0_0_#ffb4ab]",
    tono: "text-error",
  },
  aviso: {
    etiqueta: "Revisar",
    icono: "warning",
    badge: "bg-tertiary-container/30 text-tertiary",
    borde: "shadow-[inset_3px_0_0_#ffb95f]",
    tono: "text-tertiary",
  },
  info: {
    etiqueta: "Incompleto",
    icono: "info",
    badge: "bg-surface-container-high text-on-surface-variant",
    borde: "shadow-[inset_3px_0_0_#414754]",
    tono: "text-on-surface-variant",
  },
};

export default async function CalidadPage({
  searchParams,
}: {
  searchParams: { rango?: string; severidad?: string; todo?: string };
}) {
  const revisiones = await getCalidadDatos();
  const severidad = (["error", "aviso", "info"] as const).find((s) => s === searchParams.severidad) ?? "";
  // Por defecto se ocultan las revisiones sin hallazgos (siguen corriendo:
  // aparecen solas en cuanto algo falle).
  const verTodo = searchParams.todo === "1";
  const suma = (s: Severidad) => revisiones.filter((r) => r.severidad === s).reduce((t, r) => t + r.total, 0);
  const visibles = revisiones.filter((r) => (!severidad || r.severidad === severidad) && (verTodo || r.total > 0));
  const limpias = revisiones.filter((r) => r.total === 0).length;
  const extra = { rango: searchParams.rango, todo: searchParams.todo };

  return (
    <>
      <Encabezado
        titulo="Calidad de datos"
        subtitulo={`${revisiones.length} revisiones sobre todos los usuarios · ${limpias} sin hallazgos`}
      >
        <Chips
          base="/monitor/calidad"
          param="severidad"
          activo={severidad}
          extra={extra}
          opciones={[
            { valor: "", texto: "Todo" },
            { valor: "error", texto: "Errores", cuenta: suma("error") },
            { valor: "aviso", texto: "Revisar", cuenta: suma("aviso") },
            { valor: "info", texto: "Incompletos", cuenta: suma("info") },
          ]}
        />
      </Encabezado>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <KpiSimple titulo="Errores" icono="error" valor={numero(suma("error"))} pie="afectan dinero o cifras" tono={suma("error") ? "text-error" : "text-secondary"} />
        <KpiSimple titulo="Para revisar" icono="warning" valor={numero(suma("aviso"))} pie="posibles duplicados o capturas raras" tono={suma("aviso") ? "text-tertiary" : "text-secondary"} />
        <KpiSimple titulo="Datos incompletos" icono="info" valor={numero(suma("info"))} pie="limitan WhatsApp y recordatorios" />
      </div>

      <div className="flex flex-col gap-space-sm">
        {visibles.length === 0 && (
          <div className="rounded-xl bg-surface-container-low p-space-xl text-center font-body-md text-body-md text-secondary">
            <span className="material-symbols-outlined mb-2 block text-[32px]">verified</span>
            Sin hallazgos con este filtro.
          </div>
        )}
        {visibles.map((r) => {
          const e = ESTILO[r.severidad];
          return (
            <details key={r.id} className={cn("group rounded-xl bg-surface-container-low", e.borde)} open={r.severidad === "error" && r.total > 0 && r.total <= 10}>
              <summary className="flex cursor-pointer list-none items-center gap-space-md px-space-lg py-space-md">
                <span className={cn("material-symbols-outlined text-[20px]", r.total ? e.tono : "text-secondary")}>
                  {r.total ? e.icono : "check_circle"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <span className="font-title-md text-title-md text-on-surface">{r.titulo}</span>
                    <span className={cn("rounded px-1.5 py-0.5 font-label-xs text-label-xs", e.badge)}>{e.etiqueta}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{r.descripcion}</p>
                </div>
                <span className={cn("font-metric-num text-metric-num", r.total ? e.tono : "text-secondary")}>
                  {r.masDeLimite ? `${numero(r.total - 1)}+` : numero(r.total)}
                </span>
                <span className="material-symbols-outlined text-[20px] text-outline transition-transform group-open:rotate-180">
                  expand_more
                </span>
              </summary>
              {r.filas.length > 0 && (
                <div className="overflow-x-auto px-space-lg pb-space-md">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                        <th className="rounded-l px-2.5 py-2">Usuario</th>
                        <th className="px-2 py-2">Cliente</th>
                        <th className="px-2 py-2">Detalle</th>
                        <th className="rounded-r px-2.5 py-2">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-sm text-body-sm">
                      {r.filas.map((f, i) => (
                        <tr key={i} className="transition-colors hover:bg-surface-container/60">
                          <td className="px-2.5 py-2 text-on-surface-variant">{f.espacio ?? "—"}</td>
                          <td className="px-2 py-2 text-on-surface">{f.cliente ?? "—"}</td>
                          <td className="px-2 py-2 font-code-sm text-code-sm text-on-surface">{f.detalle}</td>
                          <td className="px-2.5 py-2 font-code-sm text-code-sm text-on-surface-variant">
                            {f.fecha ? fechaHora(f.fecha) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          );
        })}
      </div>

      <a
        href={`/monitor/calidad?${new URLSearchParams({
          ...(searchParams.rango ? { rango: searchParams.rango } : {}),
          ...(severidad ? { severidad } : {}),
          ...(verTodo ? {} : { todo: "1" }),
        }).toString()}`}
        className="self-start font-label-sm text-label-sm text-primary hover:underline"
      >
        {verTodo ? "Ocultar revisiones sin hallazgos" : `Ver también las ${limpias} revisiones sin hallazgos`}
      </a>
    </>
  );
}
