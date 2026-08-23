"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";
import {
  fetchConTimeout,
  mensajeDeError,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";
import { useIdempotencia } from "@/lib/offline/use-idempotencia";

export type DeudorInicial = {
  id: string;
  nombre: string;
  deudaInicial: number;
  notas: string | null;
};

export function DeudorForm({ inicial }: { inicial?: DeudorInicial }) {
  const router = useRouter();
  const claims = useAuthClaims();
  const idem = useIdempotencia();
  const editando = !!inicial;

  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [deudaInicial, setDeudaInicial] = useState(
    inicial ? String(inicial.deudaInicial) : ""
  );
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio");
    const deuda = parseFloat(deudaInicial || "0");
    if (isNaN(deuda) || deuda < 0) return setError("Deuda inválida");

    setGuardando(true);
    let res: Response;
    try {
      res = await fetchConTimeout(
        editando ? `/api/deudores/${inicial!.id}` : "/api/deudores",
        {
          method: editando ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...idem.header() },
          body: JSON.stringify({
            nombre: nombre.trim(),
            deudaInicial: deuda,
            notas: notas.trim() || null,
          }),
        },
        TIMEOUT_ESCRITURA_MS
      );
    } catch (e) {
      setGuardando(false);
      setError(mensajeDeError(e));
      return;
    }
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    idem.confirmado();
    const guardado = await res.json();
    if (claims.ready && claims.ownerId) await syncAll(claims.ownerId, { forzar: true });
    router.push(`/deudores/${guardado.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={editando ? `/deudores/${inicial!.id}` : "/deudores"}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">
        {editando ? "Editar deudor" : "Nuevo deudor"}
      </h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deuda">Deuda inicial</Label>
          <Input
            id="deuda"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={deudaInicial}
            onChange={(e) => setDeudaInicial(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notas">Notas</Label>
          <Input
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={guardando}>
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear deudor"}
        </Button>
      </form>
    </div>
  );
}
