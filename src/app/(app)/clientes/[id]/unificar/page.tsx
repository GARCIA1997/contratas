import { notFound, redirect } from "next/navigation";
import { HttpError, requireUser } from "@/lib/session";
import { contratasConSaldo } from "@/lib/services/contratas";
import { getClientePerfil } from "@/lib/services/clientes";
import { getConfig } from "@/lib/config";
import { UnificarForm } from "@/components/clientes/unificar-form";

export const dynamic = "force-dynamic";

export default async function UnificarContratasPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect(`/clientes/${params.id}`);

  try {
    const [perfil, elegibles, config] = await Promise.all([
      getClientePerfil(user.ownerId, params.id),
      contratasConSaldo(user.ownerId, params.id),
      getConfig(user.ownerId),
    ]);

    if (elegibles.length < 2) {
      redirect(`/clientes/${params.id}`);
    }

    return (
      <UnificarForm
        clienteId={perfil.id}
        clienteNombre={perfil.nombre}
        contratas={elegibles.map((c) => ({
          id: c.id,
          tipo: c.tipo,
          saldo: c.saldo,
        }))}
        cuotasPorDefecto={config.cuotasPorDefecto}
        maxCuotas={config.maxCuotas}
      />
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
