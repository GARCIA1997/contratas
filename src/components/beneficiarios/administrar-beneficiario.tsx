"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popup } from "@/components/ui/popup";
import { avisar, confirmar } from "@/lib/dialogo";
import { modoLocalActivo } from "@/lib/offline/modo-local";
import { syncAll } from "@/lib/offline/sync";
import { rutas } from "@/lib/rutas";

/**
 * Convertir un beneficiario en cliente propio (pide señal: el servidor
 * mueve sus contratas; después se sincroniza). Cambiar nombre y unir
 * duplicados se hacen desde el monitor.
 */
export function AdministrarBeneficiario({
  ownerId,
  beneficiario,
  clienteNombre,
  onCerrar,
}: {
  ownerId: string;
  beneficiario: { id: string; nombre: string };
  clienteNombre: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
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
      <p className="text-xs text-muted-foreground">Convertir en cliente propio · hoy es beneficiario de {clienteNombre}</p>

      {(
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
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Popup>,
    document.body
  );
}
