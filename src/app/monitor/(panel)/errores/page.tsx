import Link from "next/link";
import { desdeDe, getError, getErroresAgrupados } from "@/lib/monitor/datos";
import { fechaHora, haceCuanto, origenError } from "@/components/monitor/formato";
import { Chips, Encabezado, Tarjeta, Vacio } from "@/components/monitor/ui";
import { cn } from "@/lib/utils";
import { ETIQUETA_RANGO, rangoDeParams } from "../../_rango";

export const dynamic = "force-dynamic";

type SP = { rango?: string; origen?: string; q?: string; id?: string };

export default async function ErroresPage({ searchParams }: { searchParams: SP }) {
  const rango = rangoDeParams(searchParams);
  const desde = desdeDe(rango);
  const origen = searchParams.origen ?? "";
  const [todos, filtrados, detalle] = await Promise.all([
    getErroresAgrupados({ desde, q: searchParams.q }),
    getErroresAgrupados({ desde, origen: origen || undefined, q: searchParams.q }),
    searchParams.id ? getError(searchParams.id).catch(() => null) : null,
  ]);
  const cuenta = (o: string) => todos.filter((e) => e.origen === o).reduce((s, e) => s + e.veces, 0);
  const total = todos.reduce((s, e) => s + e.veces, 0);
  const base = "/monitor/errores";
  const extra = { rango, q: searchParams.q };

  function enlace(id: string) {
    const p = new URLSearchParams();
    p.set("rango", rango);
    if (origen) p.set("origen", origen);
    if (searchParams.q) p.set("q", searchParams.q);
    p.set("id", id);
    return `${base}?${p.toString()}`;
  }

  return (
    <>
      <Encabezado titulo="Centro de errores" subtitulo={`Errores reportados por los teléfonos, el servidor y la cola · ${ETIQUETA_RANGO[rango]}`}>
        <Chips
          base={base}
          param="origen"
          activo={origen}
          extra={extra}
          opciones={[
            { valor: "", texto: "Todos", cuenta: total },
            { valor: "client", texto: "Cliente", cuenta: cuenta("client") },
            { valor: "server", texto: "Servidor", cuenta: cuenta("server") },
            { valor: "queue", texto: "Cola", cuenta: cuenta("queue") },
          ]}
        />
      </Encabezado>

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <Tarjeta className={cn(detalle ? "xl:col-span-7" : "xl:col-span-12")}>
          <div className="mb-space-md flex items-center justify-between">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Incidentes agrupados</h2>
            <span className="font-label-xs text-label-xs text-on-surface-variant">{filtrados.length} grupos</span>
          </div>
          {filtrados.length === 0 ? (
            <Vacio texto="Sin errores con estos filtros 🎉" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                    <th className="rounded-l px-2.5 py-2">Mensaje</th>
                    <th className="px-2 py-2">Origen</th>
                    <th className="px-2 py-2 text-right">Veces</th>
                    <th className="px-2 py-2">Afectados</th>
                    <th className="rounded-r px-2.5 py-2">Último visto</th>
                  </tr>
                </thead>
                <tbody className="font-body-sm text-body-sm">
                  {filtrados.map((e) => {
                    const o = origenError(e.origen);
                    const sel = detalle?.id === e.id;
                    return (
                      <tr key={e.id} className={cn("transition-colors hover:bg-surface-container/60", sel && "bg-surface-container")}>
                        <td className="max-w-[360px] px-2.5 py-2.5">
                          <Link href={enlace(e.id)} className="block truncate font-code-sm text-code-sm text-on-surface hover:text-primary">
                            {e.mensaje}
                          </Link>
                          <div className="truncate font-label-xs text-label-xs text-on-surface-variant">{e.url ?? "—"}</div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`inline-flex rounded px-1.5 py-0.5 font-label-xs text-label-xs ${o.clase}`}>{o.etiqueta}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right font-code-sm text-code-sm font-semibold text-error">{e.veces}x</td>
                        <td className="max-w-[160px] truncate px-2 py-2.5 text-on-surface-variant" title={e.usuarios.join(", ")}>
                          {e.usuarios.length === 1 ? e.usuarios[0] : `${e.usuarios.length} usuarios`}
                        </td>
                        <td className="px-2.5 py-2.5 font-code-sm text-code-sm text-on-surface-variant">{haceCuanto(e.ultimo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>

        {detalle && (
          <Tarjeta className="xl:sticky xl:top-20 xl:col-span-5">
            <div className="mb-space-md flex items-start justify-between gap-space-sm">
              <div className="min-w-0">
                <span className={`inline-flex rounded px-1.5 py-0.5 font-label-xs text-label-xs ${origenError(detalle.origen).clase}`}>
                  {origenError(detalle.origen).etiqueta}
                </span>
                <h2 className="mt-space-xs break-words font-code-sm text-code-sm text-on-surface">{detalle.mensaje}</h2>
              </div>
              <Link
                href={enlace("").replace(/&?id=$/, "")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface"
                aria-label="Cerrar detalle"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </Link>
            </div>
            <dl className="mb-space-md grid grid-cols-3 gap-y-1 font-body-sm text-body-sm">
              <dt className="text-outline">Usuario</dt>
              <dd className="col-span-2 text-on-surface">{detalle.usuario}</dd>
              <dt className="text-outline">Fecha</dt>
              <dd className="col-span-2 text-on-surface">{fechaHora(detalle.creadoEn)}</dd>
              <dt className="text-outline">URL</dt>
              <dd className="col-span-2 break-all font-code-sm text-code-sm text-on-surface-variant">{detalle.url ?? "—"}</dd>
              <dt className="text-outline">Dispositivo</dt>
              <dd className="col-span-2 break-words font-code-sm text-code-sm text-on-surface-variant">{detalle.userAgent ?? "—"}</dd>
            </dl>
            <h3 className="mb-space-xs font-label-xs text-label-xs uppercase tracking-wider text-outline">Stack trace</h3>
            <pre className="mb-space-md max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-container-lowest p-space-sm font-code-sm text-code-sm text-on-surface-variant">
              {detalle.stack ?? "Sin stack trace"}
            </pre>
            {detalle.contexto != null && (
              <>
                <h3 className="mb-space-xs font-label-xs text-label-xs uppercase tracking-wider text-outline">Contexto</h3>
                <pre className="mb-space-md max-h-48 overflow-auto rounded-lg bg-surface-container-lowest p-space-sm font-code-sm text-code-sm text-on-surface-variant">
                  {JSON.stringify(detalle.contexto, null, 2)}
                </pre>
              </>
            )}
            <h3 className="mb-space-xs font-label-xs text-label-xs uppercase tracking-wider text-outline">
              Ocurrencias ({detalle.ocurrencias.length})
            </h3>
            <ol className="flex max-h-56 flex-col gap-1 overflow-auto">
              {detalle.ocurrencias.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded bg-surface-container px-space-sm py-1 font-body-sm text-body-sm">
                  <span className="text-on-surface">{o.usuario}</span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">{fechaHora(o.creadoEn)}</span>
                </li>
              ))}
            </ol>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
