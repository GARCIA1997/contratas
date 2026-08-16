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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Saludo } from "@/components/saludo";
import { CitaCard } from "@/components/citas/cita-card";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getRutaDelDia,
  getConfiguracion,
  getCitasPendientes,
} from "@/lib/offline/repo";
import { enqueue } from "@/lib/offline/queue";
import { linkWhatsApp } from "@/lib/whatsapp";
import { formatMoneda } from "@/lib/utils";
import { CONFIG_DEFAULTS } from "@/lib/config";
import type { ParadaRuta } from "@/lib/services/ruta";

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

function mensajeRecibo(nombreApp: string, r: ParadaRuta) {
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

function Parada({
  parada,
  nombreApp,
  cobrando,
  onSolicitarCobro,
}: {
  parada: ParadaRuta;
  nombreApp: string;
  cobrando: boolean;
  onSolicitarCobro: (parada: ParadaRuta) => void;
}) {
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
          <Button
            size="sm"
            disabled={cobrando}
            onClick={() => onSolicitarCobro(parada)}
          >
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
  const [vista, setVista] = useState<"COBRAR" | "ENTREGAR">("COBRAR");
  const citas = useLiveQuery(
    () => (ownerId ? getCitasPendientes(ownerId) : undefined),
    [ownerId]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );
  const nombreApp = config?.nombreApp ?? CONFIG_DEFAULTS.nombreApp;

  // Modal de confirmación de cobro — vive UNA sola vez aquí, no por
  // tarjeta. Dos motivos:
  // 1. `Card` usa `.glass-card` (`backdrop-filter`), que en CSS crea un
  //    nuevo "containing block" para hijos `position: fixed` — un Popup
  //    anidado dentro de una Card quedaba atrapado dentro de su caja en vez
  //    de cubrir la pantalla, y el botón "Cancelar" se lo comía la
  //    siguiente tarjeta. Al vivir aquí, fuera de cualquier Card, el fixed
  //    se posiciona contra el viewport como debe ser.
  // 2. Un solo estado (en vez de uno por Parada) garantiza que solo pueda
  //    haber un modal de cobro abierto a la vez — antes se podían abrir
  //    varios si se tocaba "Cobrado" en más de una tarjeta seguido.
  const [confirmando, setConfirmando] = useState<ParadaRuta | null>(null);
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);

  async function marcarCobrado(parada: ParadaRuta) {
    setConfirmando(null);
    setCobrandoId(parada.clienteId);
    try {
      for (const cuota of parada.cuotas) {
        await enqueue(ownerId as string, "contrata.pago.abonar", {
          contrataId: cuota.contrataId,
          numeroCuota: cuota.numeroCuota,
          monto: cuota.pendiente,
        });
      }
    } finally {
      setCobrandoId(null);
    }
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
          <p className="text-sm text-muted-foreground">
            {vista === "COBRAR" ? "Ruta de cobro de hoy" : "Contratas por entregar"}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/citas/nueva">
            <CalendarPlus className="size-4" /> Agendar
          </Link>
        </Button>
      </div>

      <SegmentedControl
        value={vista}
        onChange={setVista}
        options={[
          { value: "COBRAR", label: "Cobrar" },
          { value: "ENTREGAR", label: "Entregar" },
        ]}
      />

      {vista === "COBRAR" ? (
        <>
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
              <Parada
                key={p.clienteId}
                parada={p}
                nombreApp={nombreApp}
                cobrando={cobrandoId === p.clienteId}
                onSolicitarCobro={setConfirmando}
              />
            ))}
          </div>

          {paradas && paradas.length === 0 && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No hay cobros pendientes para hoy.
            </p>
          )}
        </>
      ) : (
        <>
          {citas && citas.length > 0 ? (
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
              {citas.map((c) => (
                <CitaCard key={c.id} cita={c} ownerId={ownerId as string} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Sin citas agendadas.
            </p>
          )}
        </>
      )}

      {confirmando && (
        <Popup open onClose={() => setConfirmando(null)}>
          <p className="text-sm font-semibold">{confirmando.nombre}</p>
          <p className="text-xs text-muted-foreground">Confirmar cobro</p>
          <p className="py-2 text-3xl font-bold text-pagado">
            {formatMoneda(confirmando.total)}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            {/* El envío se dispara desde el propio click del <a> (navegación
                nativa del navegador, siempre confiable) mientras el cobro
                corre en paralelo por el onClick — esperar a que el cobro
                termine antes de abrir WhatsApp arriesgaría que el navegador
                bloquee la apertura por no venir de un click síncrono. */}
            <Button asChild onClick={() => marcarCobrado(confirmando)}>
              <a
                href={linkWhatsApp(
                  confirmando.telefono,
                  mensajeRecibo(nombreApp, confirmando)
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" /> Cobrar y enviar recibo
              </a>
            </Button>
            <Button variant="outline" onClick={() => marcarCobrado(confirmando)}>
              Solo cobrar
            </Button>
            <Button variant="ghost" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
          </div>
        </Popup>
      )}
    </div>
  );
}
