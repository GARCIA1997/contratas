"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { EstadoCuentaDeudorView } from "@/components/deudores/estado-cuenta-deudor-view";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getDeudor, getConfiguracion } from "@/lib/offline/repo";
import { syncDeudorDetalle } from "@/lib/offline/sync";

export default function EstadoCuentaDeudorPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;

  const deudor = useLiveQuery(
    () => (ownerId ? getDeudor(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  useEffect(() => {
    // La lista sincronizada solo trae el resumen del deudor, no sus abonos:
    // sin esto, entrar directo aquí (sin pasar por el detalle) mostraba
    // "Sin abonos todavía" aunque sí los tuviera — y desde que el estado de
    // cuenta se comparte como imagen, ese dato vacío llegaría al cliente.
    if (ownerId) void syncDeudorDetalle(ownerId, params.id);
  }, [ownerId, params.id]);
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
