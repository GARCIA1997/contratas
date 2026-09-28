"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ClienteForm } from "@/components/clientes/cliente-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getClientePerfil } from "@/lib/offline/repo";
import { rutas } from "@/lib/rutas";
import { useRegistroParams } from "@/lib/use-registro-params";

export default function EditarClientePage() {
  const claims = useAuthClaims();
  const params = useRegistroParams();
  const router = useRouter();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  const perfil = useLiveQuery(
    () => (ownerId ? getClientePerfil(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace(rutas.cliente(params.id));
  }, [claims.ready, esAdmin, params.id, router]);

  if (!claims.ready || !esAdmin) return null;
  if (perfil === undefined) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }
  if (perfil === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cliente no encontrado.
      </p>
    );
  }

  return (
    <ClienteForm
      inicial={{
        id: perfil.id,
        nombre: perfil.nombre,
        telefono: perfil.telefono,
        direccion: perfil.direccion,
        referencia: perfil.referencia,
        notas: perfil.notas,
      }}
    />
  );
}
