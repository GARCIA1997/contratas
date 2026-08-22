"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import type { ResultadoCobroVencidas } from "@/lib/services/cobros";
import { enqueue } from "@/lib/offline/queue";
import { syncContratas } from "@/lib/offline/sync";
import { CompartirRecibo } from "@/components/recibo/compartir-recibo";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

function textoFallback(nombreApp: string, r: ResultadoCobroVencidas) {
  return [
    `*${nombreApp} — Recibo de pago*`,
    ``,
    `Cliente: ${r.clienteNombre}`,
    `Total cobrado: ${formatMoneda(r.total)}`,
    ``,
    ...r.contratas.flatMap((c) => [
      `${TIPO_LABEL[c.tipo]} · préstamo de ${formatMoneda(c.montoContrata)}`,
      ...c.cuotas.map(
        (q) => `  · Cuota ${q.numeroCuota}/${c.numCuotas}: ${formatMoneda(q.monto)}`
      ),
      `  Te resta por pagar: ${formatMoneda(c.saldoTrasCobro)}`,
    ]),
  ].join("\n");
}

export function CobroVencido({
  clienteId,
  nombreApp,
  totalInicial,
  cuotasInicial,
  ownerId,
  logoUrl,
  colorPrimario,
  nombreUsuario,
}: {
  clienteId: string;
  nombreApp: string;
  totalInicial: number;
  cuotasInicial: number;
  /** Presente cuando la página vive en la capa offline (ver repo/useLiveQuery). */
  ownerId?: string | null;
  logoUrl?: string | null;
  colorPrimario?: string;
  nombreUsuario?: string | null;
}) {
  const router = useRouter();
  const [total, setTotal] = useState(totalInicial);
  const [cuotas, setCuotas] = useState(cuotasInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCobroVencidas | null>(null);
  const [sinRecibo, setSinRecibo] = useState(false);
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
      if (typeof navigator !== "undefined" && !navigator.onLine && ownerId) {
        // Sin red no hay forma de obtener el desglose para el recibo de
        // WhatsApp (eso solo lo calcula el servidor) — se aplica optimista
        // y se avisa que el recibo se podrá enviar una vez sincronizado.
        await enqueue(ownerId, "cliente.cobrarVencidas", { clienteId });
        setTotal(0);
        setCuotas(0);
        setSinRecibo(true);
        return;
      }
      const key = idempotencyKey ?? crypto.randomUUID();
      setIdempotencyKey(key);
      const res = await fetch(`/api/clientes/${clienteId}/cobrar-vencidas`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo registrar el cobro");
      }
      const data: ResultadoCobroVencidas = await res.json();
      setResultado(data);
      setTotal(0);
      setCuotas(0);
      // El POST ya cobró en el servidor, pero la caché local (Dexie) no se
      // entera sola — sin esto, /ruta y el perfil del cliente (que leen de
      // Dexie via useLiveQuery) seguían mostrando las cuotas como vencidas
      // hasta un refresh manual.
      if (ownerId) await syncContratas(ownerId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el cobro");
    } finally {
      setCargando(false);
    }
  }

  if (sinRecibo) {
    return (
      <Card className="border-pagado/30">
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium text-pagado">Cobro registrado (sin conexión)</p>
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
    return (
      <Card className="border-pagado/30">
        <CardContent className="space-y-3 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Cobro registrado</p>
            <p className="text-2xl font-bold text-pagado">
              {formatMoneda(resultado.total)}
            </p>
          </div>
          <ul className="space-y-1.5">
            {resultado.contratas.map((c) => (
              <li
                key={c.contrataId}
                className="rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{TIPO_LABEL[c.tipo]}</span>
                  <span className="font-semibold">{formatMoneda(c.subtotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.cuotas.map((q) => `Cuota ${q.numeroCuota}/${c.numCuotas}`).join(", ")}
                  {c.saldoTrasCobro > 0
                    ? ` · resta ${formatMoneda(c.saldoTrasCobro)}`
                    : " · liquidada"}
                </p>
              </li>
            ))}
          </ul>

          <CompartirRecibo
            datos={{
              variante: "cobro",
              nombreApp,
              colorPrimario: colorPrimario ?? "#0F7BFF",
              hechoPor: nombreUsuario ?? null,
              clienteNombre: resultado.clienteNombre,
              fecha: new Date(),
              total: resultado.total,
              contratas: resultado.contratas,
            }}
            logoUrl={logoUrl}
            telefono={resultado.clienteTelefono}
            textoFallback={textoFallback(nombreApp, resultado)}
            etiqueta="Enviar recibo por WhatsApp"
          />

          <Button variant="ghost" className="w-full" onClick={() => setResultado(null)}>
            Cerrar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button
        className="w-full"
        variant="default"
        disabled={cargando}
        onClick={() => cobrar({ esReintento: idempotencyKey !== null })}
      >
        <CircleDollarSign className="size-4" />
        {cargando
          ? "Registrando…"
          : error
            ? "Reintentar cobro"
            : `Cobrar pendiente · ${formatMoneda(total)} (${cuotas} cuota${cuotas === 1 ? "" : "s"})`}
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
