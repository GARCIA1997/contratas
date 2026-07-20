"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ReciboView } from "@/components/contratas/recibo-view";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getContrata, getConfiguracion } from "@/lib/offline/repo";
import { saldoPendiente } from "@/lib/contrata";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export default function ReciboPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;

  const contrata = useLiveQuery(
    () => (ownerId ? getContrata(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  if (contrata === undefined || config === undefined) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  if (contrata === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Contrata no encontrada.
      </p>
    );
  }

  const totalAbonado = round(
    contrata.pagos.reduce((s, p) => s + p.montoAbonado, 0)
  );
  const totalEsperado = round(contrata.abono * contrata.numCuotas);
  const saldo = saldoPendiente(
    contrata.pagos.map((p) => ({
      ...p,
      fechaProgramada: new Date(p.fechaProgramada),
      fechaPago: p.fechaPago ? new Date(p.fechaPago) : null,
    })),
    contrata.abono
  );
  const cuotasPagadas = contrata.pagos.filter((p) => p.pagado).length;

  return (
    <ReciboView
      nombreApp={config?.nombreApp ?? "Kredired"}
      contrata={{
        id: contrata.id,
        clienteId: contrata.clienteId,
        clienteNombre: contrata.clienteNombre,
        clienteTelefono: contrata.clienteTelefono,
        tipo: contrata.tipo,
        monto: contrata.monto,
        abono: contrata.abono,
        numCuotas: contrata.numCuotas,
        cuotasPagadas,
        totalEsperado,
        totalAbonado,
        saldo,
        convertidaADeuda: contrata.convertidaADeuda,
        pagos: contrata.pagos,
      }}
    />
  );
}
