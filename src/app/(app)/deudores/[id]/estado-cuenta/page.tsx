import { notFound } from "next/navigation";
import { HttpError, requireUser } from "@/lib/session";
import { getDeudor, saldoActual } from "@/lib/services/deudores";
import { getConfig } from "@/lib/config";
import { EstadoCuentaDeudorView } from "@/components/deudores/estado-cuenta-deudor-view";

export const dynamic = "force-dynamic";

export default async function EstadoCuentaDeudorPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  try {
    const d = await getDeudor(user.ownerId, params.id);
    const config = await getConfig(user.ownerId);

    return (
      <EstadoCuentaDeudorView
        nombreApp={config.nombreApp}
        deudor={{
          id: d.id,
          nombre: d.nombre,
          deudaInicial: d.deudaInicial,
          saldoActual: saldoActual(d),
          abonos: d.abonos.map((a) => ({
            id: a.id,
            fecha: a.fecha.toISOString(),
            monto: a.monto,
            restante: a.restante,
          })),
        }}
      />
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
