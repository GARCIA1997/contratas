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
 *      enviado → ✓ (se oculta a los pocos segundos);
 *      falló, no se confirmó a tiempo o el servicio está caído/desconectado
 *      → ✗ + botón manual (y se cancela el automático pendiente).
 * El cobro ya quedó registrado en todos los casos; esto es solo el recibo.
 * Si el automático sale después de haberlo mandado a mano, al cliente le
 * llega dos veces el mismo recibo (riesgo aceptado).
 */

// Holgado: una entrega manda dos mensajes espaciados (comprobante y recibo). Si el
// servicio está caído no se espera esto: el servidor lo avisa de inmediato.
const TIEMPO_MAX_MS = 75_000;
const CADA_MS = 2_000;
/** El "enviado" es solo una confirmación: se quita solo. */
const OCULTAR_ENVIADO_MS = 4_000;

/** Se cancela el automático pendiente: el usuario lo va a mandar a mano. */
function avisarEnvioManual(claves: string[]) {
  void fetch("/api/whatsapp/recibos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claves }),
  }).catch(() => undefined);
}

type Fase =
  | { tipo: "en_telefono" }
  | { tipo: "enviando" }
  | { tipo: "enviado" }
  | { tipo: "fallo"; motivo: string | null };

async function sigueEnElTelefono(claves: string[]): Promise<boolean> {
  const database = db;
  if (!database) return false;
  // El comprobante de entrega usa la clave de la operación con sufijo (":entrega").
  const bases = claves.map((c) => c.split(":")[0]);
  const ops = await database.writeQueue
    .filter((op) => bases.includes(op.clave ?? op.id) && op.status !== "conflict")
    .count();
  return ops > 0;
}

export function SeguimientoRecibo({
  ownerId,
  telefono,
  claves,
  botonManual,
  onOcultar,
}: {
  ownerId: string | null | undefined;
  telefono: string | null | undefined;
  /** Idempotency-Key del cobro (o de cada operación, si fueron varias). */
  claves: string[];
  /** El botón de "Enviar recibo por WhatsApp" que la pantalla mostraba antes. */
  botonManual: React.ReactNode;
  /** Se llama cuando el "enviado" se oculta solo (la Ruta cierra su tarjeta entera). */
  onOcultar?: () => void;
}) {
  const automatico = useReciboAutomatico(ownerId);
  const aplica = automatico && Boolean(telefono) && claves.length > 0;
  const [fase, setFase] = useState<Fase>({ tipo: "enviando" });
  const [oculto, setOculto] = useState(false);
  const claveDeps = claves.join(",");

  useEffect(() => {
    if (!aplica) return;
    let vivo = true;
    setOculto(false);
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
        const j = r.ok
          ? ((await r.json()) as {
              estado: "enviando" | "enviado" | "fallo" | null;
              motivo: string | null;
              canalCaido?: string | null;
            })
          : null;
        if (!vivo) return;
        if (j?.estado === "enviado") return setFase({ tipo: "enviado" });
        if (j?.estado === "fallo") return setFase({ tipo: "fallo", motivo: j.motivo });
        if (j?.canalCaido) {
          avisarEnvioManual(lista);
          return setFase({ tipo: "fallo", motivo: j.canalCaido });
        }
      } catch {
        // Sin respuesta: cuenta contra el tiempo máximo.
      }
      if (Date.now() - desde >= TIEMPO_MAX_MS) {
        avisarEnvioManual(lista);
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

  useEffect(() => {
    if (fase.tipo !== "enviado") return;
    const t = setTimeout(() => {
      setOculto(true);
      onOcultar?.();
    }, OCULTAR_ENVIADO_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase.tipo]);

  if (!aplica) return <>{botonManual}</>;
  if (fase.tipo === "enviado" && oculto) return null;

  if (fase.tipo === "en_telefono") {
    return (
      <Aviso tono="neutro" icono={<Smartphone className="size-4" />}>
        Guardado en el teléfono. Se enviará solo por WhatsApp en cuanto se sincronice.
      </Aviso>
    );
  }
  if (fase.tipo === "enviando") {
    return (
      <Aviso tono="neutro" icono={<Loader2 className="size-4 animate-spin" />}>
        Enviando por WhatsApp…
      </Aviso>
    );
  }
  if (fase.tipo === "enviado") {
    return (
      <Aviso tono="ok" icono={<CircleCheck className="size-4" />}>
        Enviado por WhatsApp.
      </Aviso>
    );
  }
  return (
    <div className="space-y-2">
      <Aviso tono="error" icono={<CircleX className="size-4" />}>
        <span className="font-semibold">Falló el envío automático.</span> Lo que registraste sí quedó
        guardado. Envíalo manualmente.
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
