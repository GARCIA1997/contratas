"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { EstadoCuentaDeudorView } from "@/components/deudores/estado-cuenta-deudor-view";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getDeudor, getConfiguracion } from "@/lib/offline/repo";

export default function EstadoCuentaDeudorPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;

  const deudor = useLiveQuery(
    () => (ownerId ? getDeudor(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  if (deudor === undefined || config === undefined) {
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
    <EstadoCuentaDeudorView
      nombreApp={config?.nombreApp ?? "Kredired"}
      deudor={{
        id: deudor.id,
        nombre: deudor.nombre,
        deudaInicial: deudor.deudaInicial,
        saldoActual: deudor.saldoActual,
        abonos: deudor.abonos.map((a) => ({
          id: a.id,
          fecha: a.fecha,
          monto: a.monto,
          restante: a.restante,
        })),
      }}
    />
  );
}
