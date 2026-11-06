"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Combine, Pencil, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Popup } from "@/components/ui/popup";
import { avisar, confirmar } from "@/lib/dialogo";
import { modoLocalActivo } from "@/lib/offline/modo-local";
import { syncAll } from "@/lib/offline/sync";
import { rutas } from "@/lib/rutas";

type Accion = "menu" | "renombrar" | "unir" | "convertir";

/**
 * Renombrar, unir con otro (duplicado) o convertir en cliente propio. Piden
 * señal: el servidor valida y mueve las contratas; después se sincroniza.
 */
export function AdministrarBeneficiario({
  ownerId,
  beneficiario,
  otros,
  clienteNombre,
  onCerrar,
}: {
  ownerId: string;
  beneficiario: { id: string; nombre: string };
  otros: { id: string; nombre: string }[];
  clienteNombre: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [accion, setAccion] = useState<Accion>("menu");
  const [nombre, setNombre] = useState(beneficiario.nombre);
  const [destinoId, setDestinoId] = useState(otros[0]?.id ?? "");
  const [telefono, setTelefono] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => setMontado(true), []);

  async function enviar(url: string, init: RequestInit): Promise<unknown | null> {
    if (modoLocalActivo() || (typeof navigator !== "undefined" && !navigator.onLine)) {
      await avisar("Necesitas señal para hacer este cambio.");
      return null;
    }
    setOcupado(true);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "No se pudo guardar");
      await syncAll(ownerId, { forzar: true });
      return data;
    } catch (e) {
      await avisar(e instanceof Error ? e.message : "No se pudo guardar");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function renombrar() {
    const r = await enviar(`/api/beneficiarios/${beneficiario.id}`, { method: "PATCH", body: JSON.stringify({ nombre }) });
    if (r) onCerrar();
  }

  async function unir() {
    const destino = otros.find((o) => o.id === destinoId);
    if (!destino) return;
    const ok = await confirmar(
      `Las contratas de «${beneficiario.nombre}» pasan a «${destino.nombre}» y «${beneficiario.nombre}» se elimina. ¿Continuar?`,
      { aceptar: "Unir" }
    );
    if (!ok) return;
    const r = await enviar(`/api/beneficiarios/${beneficiario.id}/unir`, { method: "POST", body: JSON.stringify({ destinoId }) });
    if (r) onCerrar();
  }

  async function convertir() {
    const ok = await confirmar(
      `«${beneficiario.nombre}» será un cliente propio y sus contratas se moverán a su perfil. Dejará de aparecer con ${clienteNombre} y los mensajes de esas contratas le llegarán a su teléfono (si lo capturas). ¿Continuar?`,
      { aceptar: "Convertir" }
    );
    if (!ok) return;
    const r = (await enviar(`/api/beneficiarios/${beneficiario.id}/convertir`, {
      method: "POST",
      body: JSON.stringify({ telefono: telefono.trim() || null }),
    })) as { cliente?: { id: string } } | null;
    if (r?.cliente) {
      onCerrar();
      router.push(rutas.cliente(r.cliente.id));
    }
  }

  if (!montado) return null;
  return createPortal(
    <Popup open onClose={onCerrar} className="max-w-sm text-left">
      <p className="text-sm font-semibold">{beneficiario.nombre}</p>
      <p className="text-xs text-muted-foreground">Beneficiario de {clienteNombre}</p>

      {accion === "menu" && (
        <div className="flex flex-col gap-2 pt-3">
          <Button variant="outline" onClick={() => setAccion("renombrar")}>
            <Pencil className="size-4" /> Cambiar nombre
          </Button>
          {otros.length > 0 && (
            <Button variant="outline" onClick={() => setAccion("unir")}>
              <Combine className="size-4" /> Unir con otro (duplicado)
            </Button>
          )}
          <Button variant="outline" onClick={() => setAccion("convertir")}>
            <UserRoundPlus className="size-4" /> Convertir en cliente propio
          </Button>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      )}

      {accion === "renombrar" && (
        <div className="space-y-2 pt-3">
          <Label htmlFor="ben-nombre">Nombre</Label>
          <Input id="ben-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoCapitalize="words" />
          <p className="text-xs text-muted-foreground">Se corrige en todas sus contratas.</p>
          <div className="flex flex-col gap-2 pt-1">
            <Button disabled={ocupado || !nombre.trim()} onClick={renombrar}>
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setAccion("menu")}>
              Atrás
            </Button>
          </div>
        </div>
      )}

      {accion === "unir" && (
        <div className="space-y-2 pt-3">
          <Label htmlFor="ben-destino">Es la misma persona que…</Label>
          <Select id="ben-destino" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            {otros.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Sus contratas pasan a esa persona y «{beneficiario.nombre}» se elimina. Los pagos no cambian.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button disabled={ocupado || !destinoId} onClick={unir}>
              Unir
            </Button>
            <Button variant="ghost" onClick={() => setAccion("menu")}>
              Atrás
            </Button>
          </div>
        </div>
      )}

      {accion === "convertir" && (
        <div className="space-y-2 pt-3">
          <Label htmlFor="ben-telefono">Teléfono (opcional)</Label>
          <Input
            id="ben-telefono"
            type="tel"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Para que reciba sus propios mensajes"
          />
          <p className="text-xs text-muted-foreground">
            Sus contratas se mueven a su propio perfil. Los pagos no cambian.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button disabled={ocupado} onClick={convertir}>
              Convertir en cliente
            </Button>
            <Button variant="ghost" onClick={() => setAccion("menu")}>
              Atrás
            </Button>
          </div>
        </div>
      )}
    </Popup>,
    document.body
  );
}
