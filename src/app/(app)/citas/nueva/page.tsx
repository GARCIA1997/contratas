"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { AgendarForm } from "@/components/citas/agendar-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getClientes } from "@/lib/offline/repo";
import { rutas } from "@/lib/rutas";

export default function NuevaCitaPage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace("/ruta");
  }, [claims.ready, esAdmin, router]);

  const clientes = useLiveQuery(
    () => (ownerId ? getClientes(ownerId) : undefined),
    [ownerId]
  );

  if (!claims.ready || !esAdmin || !clientes) return null;

  const clienteIdParam = searchParams.get("clienteId");
  const opciones = clientes.map((c) => ({ id: c.id, nombre: c.nombre }));
  const clientePreseleccionado = clienteIdParam
    ? opciones.find((c) => c.id === clienteIdParam)
    : undefined;

  return (
    <AgendarForm
      clientes={opciones}
      clientePreseleccionado={clientePreseleccionado}
      volverHref={
        clientePreseleccionado ? rutas.cliente(clientePreseleccionado.id) : "/ruta"
      }
    />
  );
}
