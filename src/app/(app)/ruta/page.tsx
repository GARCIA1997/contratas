"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Phone, MessageCircle, MapPin, Check, CalendarPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popup } from "@/components/ui/popup";
import { Saludo } from "@/components/saludo";
import { CitaCard } from "@/components/citas/cita-card";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getRutaDelDia, getConfiguracion, getCitasDelDia } from "@/lib/offline/repo";
import { enqueue } from "@/lib/offline/queue";
import { linkWhatsApp } from "@/lib/whatsapp";
import { formatMoneda } from "@/lib/utils";
import { CONFIG_DEFAULTS } from "@/lib/config";
import type { CuotaRuta, ParadaRuta } from "@/lib/services/ruta";

function mensajeRecordatorio(
  nombreApp: string,
  nombre: string,
  total: number,
  diasAtrasoMax: number
) {
  const monto = formatMoneda(total);
  // Firmado con el nombre de la app en todos los mensajes salientes — para
  // que el cliente reconozca de quién viene incluso en este recordatorio
  // corto (los demás mensajes ya lo llevan en el encabezado 🧾).
  if (diasAtrasoMax > 0) {
    return `Hola ${nombre}, te recuerdo que tienes un pago pendiente de ${monto} desde hace ${diasAtrasoMax} día${diasAtrasoMax === 1 ? "" : "s"}. ¡Gracias! — ${nombreApp}`;
  }
  if (diasAtrasoMax < 0) {
    const dias = -diasAtrasoMax;
    return `Hola ${nombre}, te recuerdo que tienes un pago de ${monto} próximo a vencer en ${dias} día${dias === 1 ? "" : "s"}. ¡Gracias! — ${nombreApp}`;
  }
  return `Hola ${nombre}, te recuerdo que hoy tienes un pago pendiente de ${monto}. ¡Gracias! — ${nombreApp}`;
}

type ReciboPendiente = {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  total: number;
  cuotas: CuotaRuta[];
};

function mensajeRecibo(nombreApp: string, r: ReciboPendiente) {
  return [
    `🧾 *${nombreApp}*`,
    `*Recibo de pago*`,
    ``,
    `👤 Cliente: ${r.nombre}`,
    // Mismo formato "N/total" que el estado de cuenta — para saber de un
    // vistazo en qué número de pago va cada cuota, no solo cuántas se
    // cobraron.
    ...r.cuotas.map(
      (c) => `✅ Cuota ${c.numeroCuota}/${c.numCuotas}: ${formatMoneda(c.pendiente)}`
    ),
    `💰 Total: ${formatMoneda(r.total)}`,
    ``,
    `¡Gracias por tu pago!`,
  ].join("\n");
}

/** Popup tras marcar "Cobrado" — sobrevive aunque la parada ya haya
 * desaparecido de la ruta en vivo (ver comentario en RutaDelDiaPage). Se
 * muestra un recibo a la vez, en cola: al cerrar uno aparece el siguiente. */
function ReciboPopup({
  recibo,
  nombreApp,
  onCerrar,
}: {
  recibo: ReciboPendiente;
  nombreApp: string;
  onCerrar: () => void;
}) {
  return (
    <Popup open onClose={onCerrar}>
      <p className="text-sm font-semibold">{recibo.nombre}</p>
      <p className="text-xs text-muted-foreground">Cobro registrado</p>
      <p className="py-2 text-3xl font-bold text-pagado">
        {formatMoneda(recibo.total)}
      </p>
      <div className="flex flex-col gap-2 pt-2">
        <Button asChild onClick={onCerrar}>
          <a
            href={linkWhatsApp(recibo.telefono, mensajeRecibo(nombreApp, recibo))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="size-4" /> Enviar recibo
          </a>
        </Button>
        <Button variant="outline" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </Popup>
  );
}

function Parada({
  parada,
  ownerId,
  nombreApp,
  onCobrado,
}: {
  parada: ParadaRuta;
  ownerId: string;
  nombreApp: string;
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
                mensajeRecordatorio(
                  nombreApp,
                  parada.nombre,
                  parada.total,
                  parada.diasAtrasoMax
                )
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
  const citas = useLiveQuery(
    () => (ownerId ? getCitasDelDia(ownerId) : undefined),
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
        cuotas: parada.cuotas,
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
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Saludo nombre={nombre} />
          <p className="text-sm text-muted-foreground">Ruta de cobro de hoy</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/citas/nueva">
            <CalendarPlus className="size-4" /> Agendar
          </Link>
        </Button>
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

      {recibos[0] && (
        <ReciboPopup
          key={recibos[0].clienteId}
          recibo={recibos[0]}
          nombreApp={nombreApp}
          onCerrar={() => descartarRecibo(recibos[0].clienteId)}
        />
      )}

      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
        {paradas?.map((p) => (
          <Parada
            key={p.clienteId}
            parada={p}
            ownerId={ownerId as string}
            nombreApp={nombreApp}
            onCobrado={onCobrado}
          />
        ))}
      </div>

      {paradas && paradas.length === 0 && recibos.length === 0 && (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No hay cobros pendientes para hoy.
        </p>
      )}

      {citas && citas.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Citas para hoy
          </h2>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
            {citas.map((c) => (
              <CitaCard key={c.id} cita={c} ownerId={ownerId as string} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
