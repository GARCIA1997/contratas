"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";
import {
  fetchConTimeout,
  mensajeDeError,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";

export function EliminarCliente({
  id,
  deshabilitado,
}: {
  id: string;
  deshabilitado: boolean;
}) {
  const router = useRouter();
  const claims = useAuthClaims();
  const [borrando, setBorrando] = useState(false);

  async function eliminar() {
    if (deshabilitado) {
      alert("El cliente tiene contratas y no puede eliminarse.");
      return;
    }
    if (!confirm("¿Eliminar este cliente?")) return;
    setBorrando(true);
    let res: Response;
    try {
      res = await fetchConTimeout(
        `/api/clientes/${id}`,
        { method: "DELETE" },
        TIMEOUT_ESCRITURA_MS
      );
    } catch (e) {
      setBorrando(false);
      alert(mensajeDeError(e, "No se pudo eliminar."));
      return;
    }
    if (res.ok) {
      if (claims.ready && claims.ownerId) await syncAll(claims.ownerId, { forzar: true });
      router.push("/clientes");
      router.refresh();
    } else {
      setBorrando(false);
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "No se pudo eliminar.");
    }
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={eliminar}
      disabled={borrando || deshabilitado}
      title={deshabilitado ? "Tiene contratas asociadas" : "Eliminar"}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
