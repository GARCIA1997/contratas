"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { AgendarForm } from "@/components/citas/agendar-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getCita, getClientes } from "@/lib/offline/repo";
import { anclarFechaCliente } from "@/lib/fechas";

export default function EditarCitaPage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  const cita = useLiveQuery(
    () => (ownerId ? getCita(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const clientes = useLiveQuery(
    () => (ownerId ? getClientes(ownerId) : undefined),
    [ownerId]
  );

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace("/ruta");
  }, [claims.ready, esAdmin, router]);

  useEffect(() => {
    if (cita === null) router.replace("/ruta");
  }, [cita, router]);

  if (!claims.ready || !esAdmin || cita === undefined || cita === null || !clientes) {
    return null;
  }

  const opciones = clientes.map((c) => ({ id: c.id, nombre: c.nombre }));

  return (
    <AgendarForm
      clientes={opciones}
      inicial={{
        id: cita.id,
        clienteId: cita.clienteId,
        contrataOrigenId: cita.contrataOrigenId,
        tipo: cita.tipo,
        montoEstimado: cita.montoEstimado,
        fechaEntrega: anclarFechaCliente(cita.fechaEntrega)
          .toISOString()
          .slice(0, 10),
        notas: cita.notas,
      }}
      volverHref={`/clientes/${cita.clienteId}`}
    />
  );
}
