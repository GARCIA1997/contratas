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
import { formatMoneda } from "@/lib/utils";
import { CONFIG_DEFAULTS } from "@/lib/config";
import type { ParadaRuta } from "@/lib/services/ruta";
import { CompartirRecibo } from "@/components/recibo/compartir-recibo";
import type {
  ReciboContrataGrupo,
  ReciboCuotaPendiente,
} from "@/components/recibo/recibo-card";

/** Identidad de marca + quién opera, común a los recibos que salen de Ruta. */
type Marca = {
  nombreApp: string;
  logoUrl: string | null;
  colorPrimario: string;
  hechoPor: string | null;
};

/**
 * Las cuotas de una parada llegan planas; el recibo las muestra agrupadas por
 * contrata (un cliente puede traer 2-3 préstamos a la vez y necesita ver cuál
 * es cuál).
 */
function gruposDeParada(p: ParadaRuta): ReciboContrataGrupo[] {
  const grupos = new Map<string, ReciboContrataGrupo>();
  for (const q of p.cuotas) {
    const previo = grupos.get(q.contrataId);
    if (previo) {
      previo.cuotas.push({ numeroCuota: q.numeroCuota, monto: q.pendiente });
      previo.subtotal = Math.round((previo.subtotal + q.pendiente) * 100) / 100;
    } else {
      grupos.set(q.contrataId, {
        tipo: q.tipo,
        numCuotas: q.numCuotas,
        montoContrata: q.montoContrata,
        saldoTrasCobro: q.saldoTrasCobro,
        subtotal: q.pendiente,
        cuotas: [{ numeroCuota: q.numeroCuota, monto: q.pendiente }],
      });
    }
  }
  const lista = Array.from(grupos.values());
  for (const g of lista) {
    g.cuotas.sort((a, b) => a.numeroCuota - b.numeroCuota);
  }
  return lista;
}

function cuotasPendientes(p: ParadaRuta): ReciboCuotaPendiente[] {
  return p.cuotas.map((q) => ({
    numeroCuota: q.numeroCuota,
    numCuotas: q.numCuotas,
    tipo: q.tipo,
    montoContrata: q.montoContrata,
    pendiente: q.pendiente,
    diasAtraso: q.diasAtraso,
  }));
}

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
  marca,
  cobrando,
  onSolicitarCobro,
}: {
  parada: ParadaRuta;
  marca: Marca;
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
          <CompartirRecibo
            compacto
            variant="outline"
            size="sm"
            className="w-full"
            etiqueta="Recordar"
            icono={<MessageCircle className="size-4" />}
            datos={{
              variante: "recordatorio",
              nombreApp: marca.nombreApp,
              colorPrimario: marca.colorPrimario,
              hechoPor: marca.hechoPor,
              clienteNombre: parada.nombre,
              fecha: new Date(),
              total: parada.total,
              diasAtrasoMax: parada.diasAtrasoMax,
              cuotas: cuotasPendientes(parada),
            }}
            logoUrl={marca.logoUrl}
            telefono={parada.telefono}
            textoFallback={mensajeRecordatorio(
              marca.nombreApp,
              parada.nombre,
              parada.total,
              parada.diasAtrasoMax
            )}
          />
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
  const marca: Marca = {
    nombreApp: config?.nombreApp ?? CONFIG_DEFAULTS.nombreApp,
    logoUrl: config?.logoUrl ?? CONFIG_DEFAULTS.logoUrl,
    colorPrimario: config?.colorPrimario ?? CONFIG_DEFAULTS.colorPrimario,
    hechoPor: nombre,
  };

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
                marca={marca}
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
            {/* Registra el cobro y comparte el recibo como imagen en un solo
                paso: el cobro corre en `onAntesDeCompartir` para que el PNG
                ya refleje lo cobrado, y el modal se cierra al terminar. */}
            <CompartirRecibo
              etiqueta="Cobrar y enviar recibo"
              datos={{
                variante: "cobro",
                nombreApp: marca.nombreApp,
                colorPrimario: marca.colorPrimario,
                hechoPor: marca.hechoPor,
                clienteNombre: confirmando.nombre,
                fecha: new Date(),
                total: confirmando.total,
                contratas: gruposDeParada(confirmando),
              }}
              logoUrl={marca.logoUrl}
              telefono={confirmando.telefono}
              textoFallback={mensajeRecibo(marca.nombreApp, confirmando)}
              onAntesDeCompartir={() => marcarCobrado(confirmando)}
              onListo={() => setConfirmando(null)}
            />
            <Button
              variant="outline"
              onClick={async () => {
                await marcarCobrado(confirmando);
                setConfirmando(null);
              }}
            >
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
