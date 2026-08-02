"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Phone, MessageCircle, MapPin, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Saludo } from "@/components/saludo";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getRutaDelDia, getConfiguracion } from "@/lib/offline/repo";
import { enqueue } from "@/lib/offline/queue";
import { linkWhatsApp } from "@/lib/whatsapp";
import { formatMoneda } from "@/lib/utils";
import { CONFIG_DEFAULTS } from "@/lib/config";
import type { ParadaRuta } from "@/lib/services/ruta";

function mensajeRecordatorio(nombre: string, total: number, diasAtrasoMax: number) {
  const monto = formatMoneda(total);
  if (diasAtrasoMax > 0) {
    return `Hola ${nombre}, te recuerdo que tienes un pago pendiente de ${monto} desde hace ${diasAtrasoMax} día${diasAtrasoMax === 1 ? "" : "s"}. ¡Gracias!`;
  }
  if (diasAtrasoMax < 0) {
    const dias = -diasAtrasoMax;
    return `Hola ${nombre}, te recuerdo que tienes un pago de ${monto} próximo a vencer en ${dias} día${dias === 1 ? "" : "s"}. ¡Gracias!`;
  }
  return `Hola ${nombre}, te recuerdo que hoy tienes un pago pendiente de ${monto}. ¡Gracias!`;
}

type ReciboPendiente = {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  total: number;
  numCuotas: number;
};

function mensajeRecibo(nombreApp: string, r: ReciboPendiente) {
  return [
    `🧾 *${nombreApp}*`,
    `*Recibo de pago*`,
    ``,
    `👤 Cliente: ${r.nombre}`,
    `✅ ${r.numCuotas} cuota${r.numCuotas === 1 ? "" : "s"} pagada${r.numCuotas === 1 ? "" : "s"}`,
    `💰 Total: ${formatMoneda(r.total)}`,
    ``,
    `¡Gracias por tu pago!`,
  ].join("\n");
}

/** Tarjeta de recibo tras marcar "Cobrado" — sobrevive aunque la parada ya
 * haya desaparecido de la ruta en vivo (ver comentario en RutaDelDiaPage). */
function ReciboCard({
  recibo,
  nombreApp,
  onDescartar,
}: {
  recibo: ReciboPendiente;
  nombreApp: string;
  onDescartar: () => void;
}) {
  return (
    <Card className="border-pagado/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{recibo.nombre}</p>
            <p className="text-xs text-muted-foreground">Cobro registrado</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={onDescartar}
            aria-label="Quitar de la lista"
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-lg font-bold text-pagado">
          {formatMoneda(recibo.total)}
        </p>
        <Button className="w-full" size="sm" asChild>
          <a
            href={linkWhatsApp(recibo.telefono, mensajeRecibo(nombreApp, recibo))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="size-4" /> Enviar recibo por WhatsApp
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function Parada({
  parada,
  ownerId,
  onCobrado,
}: {
  parada: ParadaRuta;
  ownerId: string;
  onCobrado: (parada: ParadaRuta) => void;
}) {
  const [cobrando, setCobrando] = useState(false);
  const [cobrado, setCobrado] = useState(false);

  async function marcarCobrado() {
    setCobrando(true);
    try {
      for (const cuota of parada.cuotas) {
        await enqueue(ownerId, "contrata.pago.abonar", {
          contrataId: cuota.contrataId,
          numeroCuota: cuota.numeroCuota,
          monto: cuota.pendiente,
        });
      }
      setCobrado(true);
      onCobrado(parada);
    } finally {
      setCobrando(false);
    }
  }

  if (cobrado) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/clientes/${parada.clienteId}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {parada.nombre}
            </Link>
            {parada.direccion && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                {parada.direccion}
              </p>
            )}
          </div>
          <Badge
            variant={parada.diasAtrasoMax > 0 ? "vencido" : "pendiente"}
            className="shrink-0"
          >
            {parada.diasAtrasoMax > 0
              ? `${parada.diasAtrasoMax}d atraso`
              : parada.diasAtrasoMax < 0
                ? `En ${-parada.diasAtrasoMax}d`
                : "Hoy"}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {parada.cuotas.length}{" "}
            {parada.cuotas.length === 1 ? "cuota" : "cuotas"}
          </p>
          <p className="text-lg font-bold text-primary">
            {formatMoneda(parada.total)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" disabled={!parada.telefono} asChild>
            <a href={parada.telefono ? `tel:${parada.telefono}` : undefined}>
              <Phone className="size-4" /> Llamar
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={linkWhatsApp(
                parada.telefono,
                mensajeRecordatorio(parada.nombre, parada.total, parada.diasAtrasoMax)
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </Button>
          <Button size="sm" disabled={cobrando} onClick={marcarCobrado}>
            <Check className="size-4" /> Cobrado
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RutaDelDiaPage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const ownerId = claims.ready ? claims.ownerId : null;
  const nombre = claims.ready ? claims.nombre : null;

  const paradas = useLiveQuery(
    () => (ownerId ? getRutaDelDia(ownerId) : undefined),
    [ownerId]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );
  const nombreApp = config?.nombreApp ?? CONFIG_DEFAULTS.nombreApp;

  // Recibos de paradas ya cobradas en esta sesión — se guardan aparte (no
  // derivados de `paradas`) porque en cuanto se marca "Cobrado" el pago
  // optimista hace que esa parada YA NO aparezca en la ruta en vivo (deja de
  // tener saldo pendiente): sin este estado separado, la tarjeta de recibo
  // desaparecería junto con la parada antes de que se alcance a enviar por
  // WhatsApp.
  const [recibos, setRecibos] = useState<ReciboPendiente[]>([]);

  function onCobrado(parada: ParadaRuta) {
    setRecibos((r) => [
      {
        clienteId: parada.clienteId,
        nombre: parada.nombre,
        telefono: parada.telefono,
        total: parada.total,
        numCuotas: parada.cuotas.length,
      },
      ...r,
    ]);
  }

  function descartarRecibo(clienteId: string) {
    setRecibos((r) => r.filter((x) => x.clienteId !== clienteId));
  }

  // Esta es literalmente la pantalla de "voy a salir a cobrar y puedo
  // perder la señal" — a diferencia de los prefetch puntuales de otras
  // pantallas (que solo cubren lo que ya visitaste), aquí se precarga de
  // una vez TODA la ruta del día, incluyendo clientes que nunca abriste,
  // para no quedar pegado en pantalla negra al tocarlos sin conexión.
  useEffect(() => {
    if (!paradas) return;
    for (const p of paradas) {
      router.prefetch(`/clientes/${p.clienteId}`);
    }
  }, [paradas, router]);

  const totalDia = paradas?.reduce((s, p) => s + p.total, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Saludo nombre={nombre} />
        <p className="text-sm text-muted-foreground">Ruta de cobro de hoy</p>
      </div>

      {paradas && paradas.length > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">
                {paradas.length}{" "}
                {paradas.length === 1 ? "parada" : "paradas"} pendientes
              </p>
              <p className="text-lg font-bold">{formatMoneda(totalDia)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {recibos.length > 0 && (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
          {recibos.map((r) => (
            <ReciboCard
              key={r.clienteId}
              recibo={r}
              nombreApp={nombreApp}
              onDescartar={() => descartarRecibo(r.clienteId)}
            />
          ))}
        </div>
      )}

      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
        {paradas?.map((p) => (
          <Parada
            key={p.clienteId}
            parada={p}
            ownerId={ownerId as string}
            onCobrado={onCobrado}
          />
        ))}
      </div>

      {paradas && paradas.length === 0 && recibos.length === 0 && (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No hay cobros pendientes para hoy.
        </p>
      )}
    </div>
  );
}
