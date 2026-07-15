import { notFound, redirect } from "next/navigation";
import { HttpError, requireUser } from "@/lib/session";
import { getContrata, contratasConVencido } from "@/lib/services/contratas";
import { getConfig } from "@/lib/config";
import { saldoPendiente } from "@/lib/contrata";
import { RenovarForm } from "@/components/contratas/renovar-form";

export const dynamic = "force-dynamic";

export default async function RenovarContrataPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect(`/contratas/${params.id}`);

  try {
    const [contrata, config] = await Promise.all([
      getContrata(user.ownerId, params.id),
      getConfig(user.ownerId),
    ]);

    const saldoOriginal = saldoPendiente(contrata.pagos, contrata.abono);
    if (saldoOriginal <= 0 || contrata.convertidaADeuda) {
      redirect(`/contratas/${params.id}`);
    }

    const otras = await contratasConVencido(
      user.ownerId,
      contrata.clienteId,
      contrata.id
    );

    return (
      <RenovarForm
        contrataId={contrata.id}
        clienteNombre={contrata.cliente.nombre}
        tipoOriginal={contrata.tipo}
        saldoOriginal={saldoOriginal}
        otras={otras.map((c) => ({
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
