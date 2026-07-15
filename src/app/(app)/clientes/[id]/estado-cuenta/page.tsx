import { notFound } from "next/navigation";
import { HttpError, requireUser } from "@/lib/session";
import { getEstadoCuentaCliente } from "@/lib/services/clientes";
import { getConfig } from "@/lib/config";
import { EstadoCuentaView } from "@/components/clientes/estado-cuenta-view";

export const dynamic = "force-dynamic";

export default async function EstadoCuentaClientePage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  try {
    const cliente = await getEstadoCuentaCliente(user.ownerId, params.id);
    const config = await getConfig(user.ownerId);

    return (
      <EstadoCuentaView
        nombreApp={config.nombreApp}
        cliente={{
          id: cliente.id,
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          totales: cliente.totales,
          contratas: cliente.contratas.map((c) => ({
            id: c.id,
            tipo: c.tipo,
            numCuotas: c.numCuotas,
            pagados: c.pagados,
            total: c.total,
            saldo: c.saldo,
            estado: c.estado,
            totalAbonado: c.totalAbonado,
          })),
        }}
      />
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
