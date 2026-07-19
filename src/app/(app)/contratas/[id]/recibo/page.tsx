import { notFound } from "next/navigation";
import { HttpError, requireUser } from "@/lib/session";
import { getContrata } from "@/lib/services/contratas";
import { getConfig } from "@/lib/config";
import { saldoPendiente } from "@/lib/contrata";
import { ReciboView } from "@/components/contratas/recibo-view";

export const dynamic = "force-dynamic";

export default async function ReciboPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  try {
    const c = await getContrata(user.ownerId, params.id);
    const config = await getConfig(user.ownerId);

    const totalAbonado =
      Math.round(c.pagos.reduce((s, p) => s + p.montoAbonado, 0) * 100) / 100;
    const totalEsperado = Math.round(c.abono * c.numCuotas * 100) / 100;
    const saldo = saldoPendiente(c.pagos, c.abono);
    const cuotasPagadas = c.pagos.filter((p) => p.pagado).length;

    return (
      <ReciboView
        nombreApp={config.nombreApp}
        contrata={{
          id: c.id,
          clienteId: c.cliente.id,
          clienteNombre: c.cliente.nombre,
          clienteTelefono: c.cliente.telefono,
          tipo: c.tipo,
          monto: c.monto,
          abono: c.abono,
          numCuotas: c.numCuotas,
          cuotasPagadas,
          totalEsperado,
          totalAbonado,
          saldo,
          convertidaADeuda: c.convertidaADeuda,
          pagos: c.pagos.map((p) => ({
            numeroCuota: p.numeroCuota,
            fechaProgramada: p.fechaProgramada.toISOString(),
            fechaPago: p.fechaPago ? p.fechaPago.toISOString() : null,
            pagado: p.pagado,
            montoAbonado: p.montoAbonado,
          })),
        }}
      />
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
