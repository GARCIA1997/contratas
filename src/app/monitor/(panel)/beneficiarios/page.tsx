import { prisma } from "@/lib/prisma";
import { listarBeneficiariosMonitor } from "@/lib/services/beneficiarios";
import { Encabezado, Tarjeta, Vacio } from "@/components/monitor/ui";
import { AccionesBeneficiario } from "@/components/monitor/acciones-beneficiario";

export const dynamic = "force-dynamic";

const CAMPO =
  "rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";

export default async function BeneficiariosPage({ searchParams }: { searchParams: { espacio?: string; q?: string } }) {
  const [duenos, filas] = await Promise.all([
    prisma.user.findMany({ where: { workspaceOwnerId: null }, select: { id: true, nombre: true, email: true }, orderBy: { creadoEn: "asc" } }),
    listarBeneficiariosMonitor({ ownerId: searchParams.espacio || undefined, texto: searchParams.q }),
  ]);
  // Agrupados por cliente: unir solo tiene sentido dentro del mismo cliente.
  const porCliente = new Map<string, typeof filas>();
  for (const f of filas) porCliente.set(f.clienteId, [...(porCliente.get(f.clienteId) ?? []), f]);

  return (
    <>
      <Encabezado
        titulo="Beneficiarios"
        subtitulo="Cambiar nombre o unir duplicados del mismo cliente. Las contratas se mueven sin tocar pagos; los teléfonos lo ven al siguiente sync."
      />
      <Tarjeta className="gap-space-sm">
        <form className="flex flex-wrap items-center gap-space-sm" method="get">
          <select name="espacio" defaultValue={searchParams.espacio ?? ""} className={CAMPO}>
            <option value="">Todos los usuarios</option>
            {duenos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre ?? d.email}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={searchParams.q ?? ""} placeholder="Cliente o beneficiario" className={`${CAMPO} min-w-[200px] flex-1`} />
          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 font-label-sm text-label-sm text-on-primary">
            Buscar
          </button>
        </form>
      </Tarjeta>
      {porCliente.size === 0 ? (
        <Tarjeta>
          <Vacio texto="Sin beneficiarios con este filtro." />
        </Tarjeta>
      ) : (
        Array.from(porCliente.values()).map((lista) => (
          <Tarjeta key={lista[0].clienteId} className="gap-space-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-headline-sm text-headline-sm text-on-surface">{lista[0].clienteNombre}</span>
              <span className="font-label-sm text-label-sm text-outline">{lista[0].espacio}</span>
            </div>
            <ul className="divide-y divide-outline-variant/30">
              {lista.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-space-sm py-2">
                  <span className="font-body-md text-body-md text-on-surface">
                    {b.nombre}
                    <span className="ml-2 font-label-sm text-label-sm text-outline">
                      {b.contratas} contrata{b.contratas === 1 ? "" : "s"}
                    </span>
                  </span>
                  <AccionesBeneficiario
                    id={b.id}
                    nombre={b.nombre}
                    otros={lista.filter((o) => o.id !== b.id).map((o) => ({ id: o.id, nombre: o.nombre }))}
                  />
                </li>
              ))}
            </ul>
          </Tarjeta>
        ))
      )}
    </>
  );
}
