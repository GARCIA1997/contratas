import { startOfMonth } from "date-fns";
import { desdeDe, getEspacios } from "@/lib/monitor/datos";
import { fechaHora, haceCuanto, iniciales, numero } from "@/components/monitor/formato";
import { Encabezado, KpiSimple, Tarjeta, Vacio } from "@/components/monitor/ui";
import { cn } from "@/lib/utils";
import { ETIQUETA_RANGO, rangoDeParams } from "../../_rango";

export const dynamic = "force-dynamic";

const MEDALLA = ["text-[#F5C451]", "text-[#C9D1DC]", "text-[#D79A62]"];

export default async function UsuariosPage({ searchParams }: { searchParams: { rango?: string } }) {
  const rango = rangoDeParams(searchParams);
  const espacios = await getEspacios(desdeDe(rango));
  const ahora = Date.now();
  const activosEn = (ms: number) => espacios.filter((e) => e.ultimaVez && ahora - new Date(e.ultimaVez).getTime() < ms).length;
  const nuevosMes = espacios.filter((e) => new Date(e.creadoEn) >= startOfMonth(new Date())).length;

  return (
    <>
      <Encabezado
        titulo="Directorio de usuarios"
        subtitulo={`Cada usuario es un espacio de trabajo (dueño y sus miembros) · movimientos ${ETIQUETA_RANGO[rango]}`}
      />

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <KpiSimple titulo="Total usuarios" icono="group" valor={numero(espacios.length)} pie="espacios registrados" />
        <KpiSimple titulo="Activos hoy" icono="bolt" valor={numero(activosEn(24 * 3600_000))} pie="últimas 24 horas" tono="text-secondary" />
        <KpiSimple titulo="Activos 7 días" icono="date_range" valor={numero(activosEn(7 * 24 * 3600_000))} pie="última semana" tono="text-primary" />
        <KpiSimple titulo="Nuevos este mes" icono="person_add" valor={numero(nuevosMes)} pie="altas del mes" />
      </div>

      <Tarjeta>
        {espacios.length === 0 ? (
          <Vacio texto="Sin usuarios." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                  <th className="rounded-l px-2.5 py-2">#</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2 text-right">Miembros</th>
                  <th className="px-2 py-2 text-right">Movimientos</th>
                  <th className="px-2 py-2 text-right">Contratas activas</th>
                  <th className="px-2 py-2 text-right">Clientes</th>
                  <th className="px-2 py-2">Última vez</th>
                  <th className="rounded-r px-2.5 py-2">Alta</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm">
                {espacios.map((u, i) => (
                  <tr key={u.id} className="transition-colors hover:bg-surface-container/60">
                    <td className="px-2.5 py-2.5 font-code-sm text-code-sm text-on-surface-variant">
                      {i < 3 && u.movimientos > 0 ? (
                        <span className={cn("material-symbols-outlined text-[18px]", MEDALLA[i])}>workspace_premium</span>
                      ) : (
                        i + 1
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-variant font-title-md text-title-md font-semibold text-on-surface">
                          {iniciales(u.nombre)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-title-md text-title-md text-on-surface">{u.nombre}</div>
                          <div className="truncate font-code-sm text-code-sm text-outline">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{u.miembros}</td>
                    <td className={cn("px-2 py-2.5 text-right font-code-sm text-code-sm font-semibold", u.movimientos ? "text-secondary" : "text-outline")}>
                      {numero(u.movimientos)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{numero(u.contratas)}</td>
                    <td className="px-2 py-2.5 text-right font-code-sm text-code-sm text-on-surface">{numero(u.clientes)}</td>
                    <td className="px-2 py-2.5 text-on-surface-variant">{haceCuanto(u.ultimaVez)}</td>
                    <td className="px-2.5 py-2.5 font-code-sm text-code-sm text-on-surface-variant">{fechaHora(u.creadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
