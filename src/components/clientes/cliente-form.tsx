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
import { enqueue } from "@/lib/offline/queue";
import {
  fetchConTimeout,
  mensajeDeError,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";
import { useIdempotencia } from "@/lib/offline/use-idempotencia";

export type ClienteInicial = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
  notas: string | null;
};

export function ClienteForm({ inicial }: { inicial?: ClienteInicial }) {
  const router = useRouter();
  const claims = useAuthClaims();
  const idem = useIdempotencia();
  const editando = !!inicial;

  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [telefono, setTelefono] = useState(inicial?.telefono ?? "");
  const [direccion, setDireccion] = useState(inicial?.direccion ?? "");
  const [referencia, setReferencia] = useState(inicial?.referencia ?? "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio");

    setGuardando(true);

    const datos = {
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      direccion: direccion.trim() || null,
      referencia: referencia.trim() || null,
      notas: notas.trim() || null,
    };

    // Sin señal se encola y se aplica de una vez en la caché local: dar de
    // alta a alguien en la puerta de su casa es justo lo que se hace en
    // campo, y hasta ahora era de lo poco que exigía internet.
    if (
      typeof navigator !== "undefined" &&
      !navigator.onLine &&
      claims.ready &&
      claims.ownerId
    ) {
      const id = editando ? inicial!.id : crypto.randomUUID();
      try {
        await enqueue(
          claims.ownerId,
          editando ? "cliente.editar" : "cliente.crear",
          editando
            ? { clienteId: id, input: datos }
            : { id, ownerId: claims.ownerId, ...datos }
        );
      } catch (e) {
        setGuardando(false);
        setError(mensajeDeError(e, "No se pudo guardar sin conexión"));
        return;
      }
      setGuardando(false);
      router.push(`/clientes/${id}`);
      return;
    }

    let res: Response;
    try {
      res = await fetchConTimeout(
        editando ? `/api/clientes/${inicial!.id}` : "/api/clientes",
        {
          method: editando ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...idem.header() },
          body: JSON.stringify(datos),
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
    router.push(`/clientes/${guardado.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={editando ? `/clientes/${inicial!.id}` : "/clientes"}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">
        {editando ? "Editar cliente" : "Nuevo cliente"}
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
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Para enviar recibos por WhatsApp"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="direccion">Dirección</Label>
          <Input
            id="direccion"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="referencia">Referencia / aval</Label>
          <Input
            id="referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Nombre y teléfono de referencia (opcional)"
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
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </form>
    </div>
  );
}
