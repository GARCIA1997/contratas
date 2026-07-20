"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { RenovarForm } from "@/components/contratas/renovar-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getContrata,
  getContratasConVencido,
  getConfiguracion,
} from "@/lib/offline/repo";
import { saldoPendiente } from "@/lib/contrata";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function RenovarContrataPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace(`/contratas/${params.id}`);
  }, [claims.ready, esAdmin, router, params.id]);

  const contrata = useLiveQuery(
    () => (ownerId ? getContrata(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );
  const otras = useLiveQuery(
    () =>
      ownerId && contrata
        ? getContratasConVencido(ownerId, contrata.clienteId, contrata.id)
        : undefined,
    [ownerId, contrata]
  );

  useEffect(() => {
    if (contrata === null) {
      router.replace("/contratas");
      return;
    }
    if (contrata && contrata.convertidaADeuda) {
      router.replace(`/contratas/${params.id}`);
      return;
    }
    if (
      contrata &&
      saldoPendiente(
        contrata.pagos.map((p) => ({
          ...p,
          fechaProgramada: new Date(p.fechaProgramada),
        })),
        contrata.abono
      ) <= 0
    ) {
      router.replace(`/contratas/${params.id}`);
    }
  }, [contrata, params.id, router]);

  if (
    !claims.ready ||
    !esAdmin ||
    contrata === undefined ||
    contrata === null ||
    contrata.convertidaADeuda ||
    !config ||
    !otras
  ) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  const saldoOriginal = saldoPendiente(
    contrata.pagos.map((p) => ({
      ...p,
      fechaProgramada: new Date(p.fechaProgramada),
    })),
    contrata.abono
  );

  return (
    <RenovarForm
      contrataId={contrata.id}
      ownerId={ownerId}
      clienteNombre={contrata.clienteNombre}
      tipoOriginal={contrata.tipo}
      saldoOriginal={saldoOriginal}
      otras={otras.map((c) => ({ id: c.id, tipo: c.tipo, saldo: c.saldo }))}
      cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
      maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
    />
  );
}
