"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ContrataForm } from "@/components/contratas/contrata-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getContrata, getClientes, getConfiguracion } from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function EditarContrataPage() {
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
  const clientes = useLiveQuery(
    () => (ownerId ? getClientes(ownerId) : undefined),
    [ownerId]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  if (!claims.ready || !esAdmin || contrata === undefined || !clientes || !config) {
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

  return (
    <ContrataForm
      clientes={clientes.map((cl) => ({ id: cl.id, nombre: cl.nombre }))}
      cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
      maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
      tipoInicial={contrata.tipo}
      nombreApp={config?.nombreApp ?? "Kredired"}
      inicial={{
        id: contrata.id,
        clienteId: contrata.clienteId,
        tipo: contrata.tipo,
        monto: contrata.monto,
        abono: contrata.abono,
        numCuotas: contrata.numCuotas,
        fechaInicio: contrata.fechaInicio.slice(0, 10),
        notas: contrata.notas,
      }}
    />
  );
}
