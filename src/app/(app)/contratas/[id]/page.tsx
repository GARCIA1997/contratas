"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ContrataDetalle } from "@/components/contratas/contrata-detalle";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getContrata } from "@/lib/offline/repo";

export default function ContrataDetallePage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;

  const contrata = useLiveQuery(
    () => (ownerId ? getContrata(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  if (contrata === undefined) {
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
    <ContrataDetalle
      esAdmin={claims.ready ? claims.esAdmin : false}
      contrata={contrata}
      ownerId={ownerId}
    />
  );
}
