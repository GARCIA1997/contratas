"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { DeudorForm } from "@/components/deudores/deudor-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getDeudor } from "@/lib/offline/repo";
import { rutas } from "@/lib/rutas";
import { useRegistroParams } from "@/lib/use-registro-params";

export default function EditarDeudorPage() {
  const claims = useAuthClaims();
  const params = useRegistroParams();
  const router = useRouter();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  const deudor = useLiveQuery(
    () => (ownerId ? getDeudor(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace(rutas.deudor(params.id));
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
        telefono: deudor.telefono ?? null,
        deudaInicial: deudor.deudaInicial,
        notas: deudor.notas,
      }}
    />
  );
}
