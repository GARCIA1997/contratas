"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, Loader2, Smartphone } from "lucide-react";
import { db } from "@/lib/offline/db";
import { useReciboAutomatico } from "@/lib/whatsapp-auto/use-recibo-automatico";

/**
 * Estado del recibo automático de WhatsApp después de un cobro.
 *
 * Sin WhatsApp automático (o cliente sin teléfono) muestra `botonManual` tal
 * cual: la pantalla queda exactamente como antes. Con automático:
 *  - cobro aún en el teléfono (sin señal) → "se enviará al sincronizar";
 *  - en el servidor → consulta el estado hasta TIEMPO_MAX_MS:
 *      enviado → ✓;  falló o no se confirmó a tiempo → ✗ + botón manual.
 * El cobro ya quedó registrado en todos los casos; esto es solo el recibo.
 * Si el automático sale después de haberlo mandado a mano, al cliente le
 * llega dos veces el mismo recibo (riesgo aceptado).
 */

const TIEMPO_MAX_MS = 60_000;
const CADA_MS = 2_000;

type Fase =
  | { tipo: "en_telefono" }
  | { tipo: "enviando" }
  | { tipo: "enviado" }
  | { tipo: "fallo"; motivo: string | null };

async function sigueEnElTelefono(claves: string[]): Promise<boolean> {
  const database = db;
  if (!database) return false;
  const ops = await database.writeQueue
    .filter((op) => claves.includes(op.clave ?? op.id) && op.status !== "conflict")
    .count();
  return ops > 0;
}

export function SeguimientoRecibo({
  ownerId,
  telefono,
  claves,
  botonManual,
}: {
  ownerId: string | null | undefined;
  telefono: string | null | undefined;
  /** Idempotency-Key del cobro (o de cada operación, si fueron varias). */
  claves: string[];
  /** El botón de "Enviar recibo por WhatsApp" que la pantalla mostraba antes. */
  botonManual: React.ReactNode;
}) {
  const automatico = useReciboAutomatico(ownerId);
  const aplica = automatico && Boolean(telefono) && claves.length > 0;
  const [fase, setFase] = useState<Fase>({ tipo: "enviando" });
  const claveDeps = claves.join(",");

  useEffect(() => {
    if (!aplica) return;
    let vivo = true;
    let desde: number | null = null;
    let t: ReturnType<typeof setTimeout>;
    const lista = claveDeps.split(",");

    async function vuelta() {
      if (!vivo) return;
      if (await sigueEnElTelefono(lista)) {
        setFase({ tipo: "en_telefono" });
        desde = null;
        t = setTimeout(vuelta, CADA_MS);
        return;
      }
      desde ??= Date.now();
      setFase((f) => (f.tipo === "en_telefono" ? { tipo: "enviando" } : f));
      try {
        const r = await fetch(`/api/whatsapp/recibos?claves=${encodeURIComponent(lista.join(","))}`, { cache: "no-store" });
        const j = r.ok ? ((await r.json()) as { estado: "enviando" | "enviado" | "fallo" | null; motivo: string | null }) : null;
        if (!vivo) return;
        if (j?.estado === "enviado") return setFase({ tipo: "enviado" });
        if (j?.estado === "fallo") return setFase({ tipo: "fallo", motivo: j.motivo });
      } catch {
        // Sin respuesta: cuenta contra el tiempo máximo.
      }
      if (Date.now() - desde >= TIEMPO_MAX_MS) {
        setFase({ tipo: "fallo", motivo: "No se confirmó el envío a tiempo" });
        return;
      }
      t = setTimeout(vuelta, CADA_MS);
    }
    void vuelta();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [aplica, claveDeps]);

  if (!aplica) return <>{botonManual}</>;

  if (fase.tipo === "en_telefono") {
    return (
      <Aviso tono="neutro" icono={<Smartphone className="size-4" />}>
        Cobro guardado en el teléfono. El recibo se enviará solo por WhatsApp en cuanto se sincronice.
      </Aviso>
    );
  }
  if (fase.tipo === "enviando") {
    return (
      <Aviso tono="neutro" icono={<Loader2 className="size-4 animate-spin" />}>
        Enviando recibo por WhatsApp…
      </Aviso>
    );
  }
  if (fase.tipo === "enviado") {
    return (
      <Aviso tono="ok" icono={<CircleCheck className="size-4" />}>
        Recibo enviado por WhatsApp.
      </Aviso>
    );
  }
  return (
    <div className="space-y-2">
      <Aviso tono="error" icono={<CircleX className="size-4" />}>
        <span className="font-semibold">Falló el envío automático del recibo.</span> El cobro sí quedó
        registrado. Envía el recibo manualmente.
        {fase.motivo && <span className="mt-0.5 block opacity-80">({fase.motivo})</span>}
      </Aviso>
      {botonManual}
    </div>
  );
}

function Aviso({
  tono,
  icono,
  children,
}: {
  tono: "neutro" | "ok" | "error";
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  const clases = {
    neutro: "border-border/60 bg-secondary/30 text-muted-foreground",
    ok: "border-pagado/30 bg-pagado/10 text-pagado",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
  }[tono];
  return (
    <p role="status" className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs ${clases}`}>
      <span className="mt-0.5 shrink-0">{icono}</span>
      <span>{children}</span>
    </p>
  );
}
