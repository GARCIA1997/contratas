"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import type { TipoContrata } from "@prisma/client";
import { ContrataForm } from "@/components/contratas/contrata-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getClientes, getConfiguracion } from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function NuevaContrataPage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace("/contratas");
  }, [claims.ready, esAdmin, router]);

  const clientes = useLiveQuery(
    () => (ownerId ? getClientes(ownerId) : undefined),
    [ownerId]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  if (!claims.ready || !esAdmin || !clientes || !config) return null;

  const tipoParam = searchParams.get("tipo");
  const tipoInicial: TipoContrata =
    tipoParam === "QUINCENAL"
      ? "QUINCENAL"
      : tipoParam === "MENSUAL"
        ? "MENSUAL"
        : "SEMANAL";

  const clienteIdParam = searchParams.get("clienteId");
  const opciones = clientes.map((c) => ({ id: c.id, nombre: c.nombre }));
  const clientePreseleccionado = clienteIdParam
    ? opciones.find((c) => c.id === clienteIdParam)
    : undefined;

  return (
    <ContrataForm
      clientes={opciones}
      cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
      maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
      tipoInicial={tipoInicial}
      nombreApp={config?.nombreApp ?? "Kredired"}
      clientePreseleccionado={clientePreseleccionado}
      volverHref={
        clientePreseleccionado
          ? `/clientes/${clientePreseleccionado.id}`
          : "/contratas"
      }
    />
  );
}
