"use client";

import { useRef, useState } from "react";
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
import { verificarClienteNuevo, type Verificacion } from "@/lib/offline/verificar-cliente";
import { AvisoClienteExistente } from "@/components/clientes/aviso-cliente-existente";

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
  const [aviso, setAviso] = useState<Exclude<Verificacion, { tipo: "nuevo" }> | null>(null);
  // Candado síncrono: dos toques seguidos en "Crear" llegaban a disparar dos
  // altas antes de que el botón se deshabilitara (el estado tarda un render).
  const enCurso = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio");
    await guardar(false);
  }

  async function guardar(yaRevisado: boolean) {
    if (enCurso.current) return;
    enCurso.current = true;
    setGuardando(true);
    setAviso(null);

    // Antes de dar de alta: ¿ya existe? (teléfono, cola y servidor).
    const ownerIdRevision = claims.ready ? claims.ownerId : null;
    if (!editando && !yaRevisado && ownerIdRevision) {
      const v = await verificarClienteNuevo(ownerIdRevision, { nombre: nombre.trim(), telefono });
      if (v.tipo !== "nuevo") {
        setAviso(v);
        setGuardando(false);
        enCurso.current = false;
        return;
      }
    }

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
            ? { type: "cliente.editar", payload: { clienteId: id, input: datos } }
            : { type: "cliente.crear", payload: { id, ownerId, ...datos } },
        ],
      });
      idem.confirmado();
      if (r.enServidor && ownerId) await syncAll(ownerId, { forzar: true });
      router.push(rutas.cliente(id));
      if (r.enServidor) router.refresh();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
      enCurso.current = false;
    }
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={editando ? rutas.cliente(inicial!.id) : "/clientes"}>
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
        {aviso && claims.ready && claims.ownerId && (
          <AvisoClienteExistente
            ownerId={claims.ownerId}
            verificacion={aviso}
            onRegistrarDeTodos={() => void guardar(true)}
            onCancelar={() => setAviso(null)}
          />
        )}
        <Button type="submit" className="w-full" disabled={guardando || !!aviso}>
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </form>
    </div>
  );
}
