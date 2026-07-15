import { notFound, redirect } from "next/navigation";
import { HttpError, requireUser } from "@/lib/session";
import { getContrata } from "@/lib/services/contratas";
import { listClientes } from "@/lib/services/clientes";
import { getConfig } from "@/lib/config";
import { ContrataForm } from "@/components/contratas/contrata-form";

export const dynamic = "force-dynamic";

export default async function EditarContrataPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect(`/contratas/${params.id}`);

  try {
    const [c, clientes, config] = await Promise.all([
      getContrata(user.ownerId, params.id),
      listClientes(user.ownerId),
      getConfig(user.ownerId),
    ]);

    return (
      <ContrataForm
        clientes={clientes.map((cl) => ({ id: cl.id, nombre: cl.nombre }))}
        cuotasPorDefecto={config.cuotasPorDefecto}
        maxCuotas={config.maxCuotas}
        tipoInicial={c.tipo}
        inicial={{
          id: c.id,
          clienteId: c.clienteId,
          tipo: c.tipo,
          monto: c.monto,
          abono: c.abono,
          numCuotas: c.numCuotas,
          fechaInicio: c.fechaInicio.toISOString().slice(0, 10),
          notas: c.notas,
        }}
      />
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
