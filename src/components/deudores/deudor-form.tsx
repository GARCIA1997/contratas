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
import { guardarOperacion } from "@/lib/offline/guardar";
import { mensajeDeError } from "@/lib/offline/conexion";
import { useIdempotencia } from "@/lib/offline/use-idempotencia";
import { rutas } from "@/lib/rutas";

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

    const datos = {
      nombre: nombre.trim(),
      deudaInicial: deuda,
      notas: notas.trim() || null,
    };

    const ownerId = claims.ready ? claims.ownerId : null;
    // Id generado aquí también con señal: si la petición se cae a medio
    // camino y pasa a la cola, el servidor reconoce el alta en vez de
    // duplicarla (ver guardar.ts).
    const id = editando ? inicial!.id : crypto.randomUUID();
    try {
      const r = await guardarOperacion({
        ownerId,
        clave: idem.clave(),
        lote: [
          editando
            ? { type: "deudor.editar", payload: { deudorId: id, input: datos } }
            : { type: "deudor.crear", payload: { id, ownerId, ...datos } },
        ],
      });
      idem.confirmado();
      if (r.enServidor && ownerId) await syncAll(ownerId, { forzar: true });
      router.push(rutas.deudor(id));
      if (r.enServidor) router.refresh();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={editando ? rutas.deudor(inicial!.id) : "/deudores"}>
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
