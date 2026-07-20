"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { HistorialView } from "@/components/clientes/historial-view";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getHistorialCliente } from "@/lib/offline/repo";

export default function HistorialClientePage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;

  const historial = useLiveQuery(
    () => (ownerId ? getHistorialCliente(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  if (historial === undefined) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  if (historial === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cliente no encontrado.
      </p>
    );
  }

  return (
    <HistorialView
      clienteId={historial.id}
      nombre={historial.nombre}
      eventos={historial.eventos.map((e) => ({
        ...e,
        fecha: e.fecha.toISOString(),
      }))}
    />
  );
}
