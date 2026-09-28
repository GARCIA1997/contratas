"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, MessageCircle } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatMoneda } from "@/lib/utils";
import type { ResultadoCobroVencidas } from "@/lib/services/cobros";
import { guardarOperacion } from "@/lib/offline/guardar";
import { syncContratas } from "@/lib/offline/sync";
import { linkWhatsApp } from "@/lib/whatsapp";
import { mensajeCobro } from "@/lib/mensajes-whatsapp";
import { mensajeDeError } from "@/lib/offline/conexion";
import { getCobroVencidoDetalle } from "@/lib/offline/repo";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

function construirMensaje(nombreApp: string, r: ResultadoCobroVencidas) {
  return mensajeCobro({
    nombreApp,
    clienteNombre: r.clienteNombre,
    total: r.total,
    contratas: r.contratas.map((c) => ({
      tipo: c.tipo,
      numCuotas: c.numCuotas,
      cuotas: c.cuotas,
      subtotal: c.subtotal,
    })),
  });
}

export function CobroVencido({
  clienteId,
  nombreApp,
  totalInicial,
  cuotasInicial,
  ownerId,
  enFila = false,
}: {
  clienteId: string;
  nombreApp: string;
  totalInicial: number;
  cuotasInicial: number;
  /** Presente cuando la página vive en la capa offline (ver repo/useLiveQuery). */
  ownerId?: string | null;
  /**
   * El botón comparte renglón con otro (hoy "Abonar", en el perfil del
   * cliente), dentro de un grid de 2 columnas. Compacta la etiqueta a dos
   * renglones y hace que el recibo que aparece DESPUÉS de cobrar ocupe la
   * fila completa — a media columna queda ilegible en un celular.
   */
  enFila?: boolean;
}) {
  const router = useRouter();
  const [total, setTotal] = useState(totalInicial);
  const [cuotas, setCuotas] = useState(cuotasInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCobroVencidas | null>(
    null
  );
  const [sinRecibo, setSinRecibo] = useState(false);
  /** El cobro se aplicó local y todavía no viajó al servidor. */
  const [offlinePendiente, setOfflinePendiente] = useState(false);
  // Se fija en el primer intento y se reutiliza en los reintentos: si el
  // servidor ya cobró pero la respuesta se perdió por la red, reintentar
  // con la misma key hace que el servidor devuelva el resultado ya
  // registrado en vez de cobrar dos veces.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  if (total <= 0 && !resultado && !sinRecibo) return null;

  async function cobrar(opts?: { esReintento?: boolean }) {
    if (!opts?.esReintento) {
      const ok = confirm(
        `Vas a registrar el pago completo de ${cuotas} cuota(s) por un total de ${formatMoneda(total)} (incluye vencidas y próximas a vencer). ¿Confirmar?`
      );
      if (!ok) return;
    }
    setCargando(true);
    setError(null);
    try {
      // El desglose se calcula ANTES de guardar: si termina en la cola, el
      // efecto optimista marca las cuotas como pagadas y ya no habría nada
      // que desglosar. Sale de Dexie (ver getCobroVencidoDetalle).
      const detalle = ownerId ? await getCobroVencidoDetalle(ownerId, clienteId) : null;
      const clave = idempotencyKey ?? crypto.randomUUID();
      setIdempotencyKey(clave);
      const r = await guardarOperacion<ResultadoCobroVencidas>({
        ownerId,
        clave,
        lote: [{ type: "cliente.cobrarVencidas", payload: { clienteId } }],
      });
      setTotal(0);
      setCuotas(0);
      if (r.enServidor) {
        setResultado(r.datos);
        // La caché local no se entera sola del cobro hecho en el servidor.
        if (ownerId) await syncContratas(ownerId);
        router.refresh();
      } else {
        setOfflinePendiente(true);
        if (detalle) setResultado(detalle);
        else setSinRecibo(true);
      }
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo registrar el cobro"));
    } finally {
      setCargando(false);
    }
  }

  if (sinRecibo) {
    return (
      <Card className={cn("border-pagado/30", enFila && "col-span-2")}>
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium text-pagado">Cobro guardado en el teléfono</p>
          <p className="text-xs text-muted-foreground">
            Se aplicó localmente y se sincronizará con el servidor en cuanto
            haya conexión. El recibo de WhatsApp se podrá enviar después,
            desde el detalle de cada contrata.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (resultado) {
    const mensaje = construirMensaje(nombreApp, resultado);
    const link = linkWhatsApp(resultado.clienteTelefono, mensaje);

    return (
      <Card className={cn("border-pagado/30", enFila && "col-span-2")}>
        <CardContent className="space-y-3 p-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {offlinePendiente ? "Cobro guardado en el teléfono" : "Cobro registrado"}
            </p>
            <p className="text-2xl font-bold text-pagado">
              {formatMoneda(resultado.total)}
            </p>
            {offlinePendiente && (
              <p className="text-xs text-muted-foreground">
                Se sube al servidor al sincronizar. El recibo ya se puede
                enviar.
              </p>
            )}
          </div>
          <ul className="space-y-1.5">
            {resultado.contratas.map((c) => (
              <li
                key={c.contrataId}
                className="rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{TIPO_LABEL[c.tipo]}</span>
                  <span className="font-semibold">
                    {formatMoneda(c.subtotal)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.cuotas
                    .map((q) => `Cuota ${q.numeroCuota}/${c.numCuotas}`)
                    .join(", ")}
                </p>
              </li>
            ))}
          </ul>
          <Button className="w-full" asChild>
            <a href={link} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" /> Enviar recibo por WhatsApp
            </a>
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setResultado(null)}
          >
            Cerrar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-1.5", enFila && "min-w-0")}>
      <Button
        className={cn("w-full min-w-0", enFila && "h-auto py-1.5")}
        variant="default"
        disabled={cargando}
        onClick={() => cobrar({ esReintento: idempotencyKey !== null })}
      >
        <CircleDollarSign className="size-4" />
        {/*
          `truncate` porque el Button base es `whitespace-nowrap`: sin esto
          una etiqueta más larga que el botón se sale de la píldora en vez
          de recortarse.

          A media fila la etiqueta va en dos renglones. Medido en un celular
          de 375px: el texto dispone de 83px y "Cobrar $5,000.00" necesita
          120px en una sola línea — bajarle la fuente no alcanzaba, y
          recortar el monto (que es EL dato del botón) no es opción. El
          número de cuotas no se pierde: el confirm previo al cobro lo dice
          completo antes de aplicar nada.
        */}
        {cargando || error ? (
          <span className="truncate">
            {cargando ? "Registrando…" : "Reintentar cobro"}
          </span>
        ) : enFila ? (
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-[11px] font-normal opacity-90">Cobrar</span>
            <span className="truncate text-sm font-semibold">
              {formatMoneda(total)}
            </span>
          </span>
        ) : (
          <span className="truncate">
            {`Cobrar pendiente · ${formatMoneda(total)} (${cuotas} cuota${cuotas === 1 ? "" : "s"})`}
          </span>
        )}
      </Button>
      {error && (
        <p className="text-center text-xs text-destructive">
          {error}. Si el cobro ya se había registrado, reintentar no lo
          duplicará.
        </p>
      )}
    </div>
  );
}
