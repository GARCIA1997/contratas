"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { DeudorDetalle } from "@/components/deudores/deudor-detalle";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getDeudor } from "@/lib/offline/repo";
import { syncDeudorDetalle } from "@/lib/offline/sync";

export default function DeudorDetallePage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;

  const deudor = useLiveQuery(
    () => (ownerId ? getDeudor(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  useEffect(() => {
    // El resumen sincronizado (lista) no trae el historial de abonos —
    // se trae completo al entrar al detalle, si hay red.
    if (ownerId) void syncDeudorDetalle(ownerId, params.id);
  }, [ownerId, params.id]);

  if (deudor === undefined) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  if (deudor === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Deudor no encontrado.
      </p>
    );
  }

  return (
    <DeudorDetalle
      esAdmin={claims.ready ? claims.esAdmin : false}
      deudor={deudor}
      ownerId={ownerId}
    />
  );
}
