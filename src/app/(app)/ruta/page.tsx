"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Phone, MessageCircle, MapPin, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Saludo } from "@/components/saludo";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getRutaDelDia } from "@/lib/offline/repo";
import { enqueue } from "@/lib/offline/queue";
import { linkWhatsApp } from "@/lib/whatsapp";
import { formatMoneda } from "@/lib/utils";
import type { ParadaRuta } from "@/lib/services/ruta";

function mensajeRecordatorio(nombre: string, total: number) {
  return `Hola ${nombre}, te recuerdo que hoy tienes un pago pendiente de ${formatMoneda(
    total
  )}. ¡Gracias!`;
}

function Parada({
  parada,
  ownerId,
}: {
  parada: ParadaRuta;
  ownerId: string;
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
                mensajeRecordatorio(parada.nombre, parada.total)
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
  const ownerId = claims.ready ? claims.ownerId : null;
  const nombre = claims.ready ? claims.nombre : null;

  const paradas = useLiveQuery(
    () => (ownerId ? getRutaDelDia(ownerId) : undefined),
    [ownerId]
  );

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

      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
        {paradas?.map((p) => (
          <Parada key={p.clienteId} parada={p} ownerId={ownerId as string} />
        ))}
      </div>

      {paradas && paradas.length === 0 && (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No hay cobros pendientes para hoy.
        </p>
      )}
    </div>
  );
}
