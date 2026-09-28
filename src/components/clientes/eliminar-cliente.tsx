"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";
import { guardarOperacion } from "@/lib/offline/guardar";
import { mensajeDeError } from "@/lib/offline/conexion";

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

    const ownerId = claims.ready ? claims.ownerId : null;
    try {
      const r = await guardarOperacion({
        ownerId,
        clave: crypto.randomUUID(),
        lote: [{ type: "cliente.eliminar", payload: { clienteId: id } }],
      });
      if (r.enServidor && ownerId) await syncAll(ownerId, { forzar: true });
      router.push("/clientes");
      if (r.enServidor) router.refresh();
    } catch (e) {
      setBorrando(false);
      alert(mensajeDeError(e, "No se pudo eliminar."));
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
