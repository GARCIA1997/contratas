"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { DeudorForm } from "@/components/deudores/deudor-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getDeudor } from "@/lib/offline/repo";

export default function EditarDeudorPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  const deudor = useLiveQuery(
    () => (ownerId ? getDeudor(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace(`/deudores/${params.id}`);
  }, [claims.ready, esAdmin, params.id, router]);

  if (!claims.ready || !esAdmin) return null;
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
    <DeudorForm
      inicial={{
        id: deudor.id,
        nombre: deudor.nombre,
        deudaInicial: deudor.deudaInicial,
        notas: deudor.notas,
      }}
    />
  );
}
