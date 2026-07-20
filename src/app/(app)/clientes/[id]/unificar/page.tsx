"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { UnificarForm } from "@/components/clientes/unificar-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getClientePerfil,
  getContratasConSaldo,
  getConfiguracion,
} from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function UnificarContratasPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace(`/clientes/${params.id}`);
  }, [claims.ready, esAdmin, router, params.id]);

  const perfil = useLiveQuery(
    () => (ownerId ? getClientePerfil(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const elegibles = useLiveQuery(
    () => (ownerId ? getContratasConSaldo(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  useEffect(() => {
    if (elegibles && elegibles.length < 2) {
      router.replace(`/clientes/${params.id}`);
    }
  }, [elegibles, params.id, router]);

  if (
    !claims.ready ||
    !esAdmin ||
    perfil === undefined ||
    perfil === null ||
    !elegibles ||
    elegibles.length < 2 ||
    !config
  ) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  return (
    <UnificarForm
      clienteId={perfil.id}
      ownerId={ownerId}
      clienteNombre={perfil.nombre}
      contratas={elegibles.map((c) => ({ id: c.id, tipo: c.tipo, saldo: c.saldo }))}
      cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
      maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
    />
  );
}
