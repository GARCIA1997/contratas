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
import { CitaCard } from "@/components/citas/cita-card";
import { AbonarModal } from "@/components/clientes/abonar-modal";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getRutaDelDia,
  getConfiguracion,
  getCitasPendientes,
} from "@/lib/offline/repo";
import { enqueue } from "@/lib/offline/queue";
import { linkWhatsApp } from "@/lib/whatsapp";
import {
  mensajeCobro,
  mensajeRecordatorio,
  type CobroContrata,
} from "@/lib/mensajes-whatsapp";
import { formatMoneda } from "@/lib/utils";
import { CONFIG_DEFAULTS } from "@/lib/config";
import {
  agruparCitasPorSemana,
  type FiltroPeriodicidad,
} from "@/lib/citas";
import type { ParadaRuta } from "@/lib/services/ruta";

/** Para el mensaje de "no hay entregas X pendientes". */
const ETIQUETA_FILTRO: Record<FiltroPeriodicidad, string> = {
  TODAS: "",
  SEMANAL: "semanales",
  QUINCENAL: "quincenales",
  MENSUAL: "mensuales",
  SIN_DEFINIR: "sin periodicidad",
};

function recordatorioDeParada(nombreApp: string, r: ParadaRuta) {
  return mensajeRecordatorio({
    nombreApp,
    clienteNombre: r.nombre,
    total: r.total,
    diasAtrasoMax: r.diasAtrasoMax,
    cuotas: r.cuotas.map((c) => ({
      numeroCuota: c.numeroCuota,
      numCuotas: c.numCuotas,
      pendiente: c.pendiente,
      diasAtraso: c.diasAtraso,
    })),
  });
}

/**
 * En Ruta se cobran cuotas sueltas de varias contratas a la vez, y la parada
 * no sabe a qué contrata pertenece cada una más allá de su id — así que cada
 * contrata se manda como su propio grupo, sin capital ni saldo restante
 * (esos datos no viajan en `ParadaRuta`). El mensaje los omite solo.
 */
function reciboDeParada(nombreApp: string, r: ParadaRuta) {
  const porContrata = new Map<string, CobroContrata>();
  for (const c of r.cuotas) {
    const grupo = porContrata.get(c.contrataId);
    if (grupo) {
      grupo.cuotas.push({ numeroCuota: c.numeroCuota, monto: c.pendiente });
      grupo.subtotal = Math.round((grupo.subtotal + c.pendiente) * 100) / 100;
    } else {
      porContrata.set(c.contrataId, {
        numCuotas: c.numCuotas,
        cuotas: [{ numeroCuota: c.numeroCuota, monto: c.pendiente }],
        subtotal: c.pendiente,
      });
    }
  }
  return mensajeCobro({
    nombreApp,
    clienteNombre: r.nombre,
    total: r.total,
    contratas: Array.from(porContrata.values()),
  });
}

function Parada({
  parada,
  nombreApp,
  cobrando,
  onSolicitarCobro,
  ownerId,
}: {
  parada: ParadaRuta;
  nombreApp: string;
  cobrando: boolean;
  onSolicitarCobro: (parada: ParadaRuta) => void;
  ownerId: string | null;
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

        {/* Dos renglones de dos: arriba contactar (llamar / WhatsApp),
            abajo registrar dinero (abonar / cobrado). Separa lo que solo
            comunica de lo que mueve saldo — "Cobrado" queda lejos de
            "Llamar", que era el toque accidental fácil en la calle. */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={!parada.telefono} asChild>
            <a href={parada.telefono ? `tel:${parada.telefono}` : undefined}>
              <Phone className="size-4" /> Llamar
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={linkWhatsApp(
                parada.telefono,
                recordatorioDeParada(nombreApp, parada)
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </Button>

          {ownerId ? (
            <AbonarModal
              clienteId={parada.clienteId}
              ownerId={ownerId}
              nombreApp={nombreApp}
              clienteNombre={parada.nombre}
              telefono={parada.telefono}
              size="sm"
            />
          ) : (
            // Sin ownerId todavía (claims cargando) se deja la celda vacía
            // para que "Cobrado" no se recorra a la columna izquierda.
            <div />
          )}
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

  const paradas = useLiveQuery(
    () => (ownerId ? getRutaDelDia(ownerId) : undefined),
    [ownerId]
  );
  const [vista, setVista] = useState<"COBRAR" | "ENTREGAR">("COBRAR");
  const [filtroEntrega, setFiltroEntrega] = useState<FiltroPeriodicidad>("TODAS");
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
  // Las secciones por semana de la pestaña "Entregar". Se calcula siempre
  // (es barato y puro) para no meter un hook condicional.
  const semanas = agruparCitasPorSemana(citas ?? [], filtroEntrega);
  // Cuántas quedan sin periodicidad — para explicar un filtro vacío en vez
  // de dejarlo mudo (ver el mensaje de la lista vacía).
  const sinPeriodicidad = agruparCitasPorSemana(
    citas ?? [],
    "SIN_DEFINIR"
  ).reduce((n, s) => n + s.citas.length, 0);

  return (
    <div className="space-y-4">
      {/* Sin saludo: Ruta es la pantalla que se usa de pie en la calle y
          cada renglón de arriba empuja las paradas fuera de la vista. El
          saludo ya está en Inicio, que es donde tiene sentido. */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">
          {vista === "COBRAR" ? "Ruta de cobro de hoy" : "Contratas por entregar"}
        </h1>
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
                ownerId={ownerId}
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
          <SegmentedControl
            value={filtroEntrega}
            onChange={setFiltroEntrega}
            options={[
              { value: "TODAS", label: "Todas" },
              { value: "SEMANAL", label: "Semanal" },
              { value: "QUINCENAL", label: "Quincenal" },
              { value: "MENSUAL", label: "Mensual" },
            ]}
          />

          {semanas.length > 0 ? (
            <div className="space-y-5">
              {semanas.map((s) => (
                <section key={s.clave} className="space-y-3">
                  {/* Encabezado de sección: pegajoso para que al recorrer
                      una semana larga siga a la vista de qué semana y de
                      cuánto dinero se está hablando. */}
                  {/* El offset se pega justo debajo del AppHeader, que es
                      `sticky top-0` con 0.75rem de padding + 3.5rem de alto
                      (más el safe-area del notch). Con `top-2` el
                      encabezado de sección se metía DEBAJO de la barra y no
                      se veía. z-10 < z-40 del header, para que sea la barra
                      la que quede encima. */}
                  <div className="sticky top-[calc(env(safe-area-inset-top)+4.75rem)] z-10 flex items-center justify-between gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 backdrop-blur">
                    {/* Sin `capitalize`: pondría mayúscula a cada palabra
                        ("31 Ago – 6 Sep · 8 Entregas") y en español los
                        meses van en minúscula. */}
                    <p className="text-xs font-semibold">
                      {s.titulo}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · {s.citas.length}{" "}
                        {s.citas.length === 1 ? "entrega" : "entregas"}
                      </span>
                    </p>
                    <p className="shrink-0 text-sm font-bold text-primary">
                      {formatMoneda(s.total)}
                    </p>
                  </div>
                  <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
                    {s.citas.map((c) => (
                      <CitaCard key={c.id} cita={c} ownerId={ownerId as string} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : citas && citas.length > 0 ? (
            <div className="space-y-1 py-10 text-center">
              <p className="text-xs text-muted-foreground">
                No hay entregas {ETIQUETA_FILTRO[filtroEntrega]} pendientes.
              </p>
              {/* Las citas agendadas antes de que existiera el campo de
                  periodicidad no salen en ningún filtro, solo en "Todas".
                  Sin este aviso, el filtro vacío parece un error de la app
                  en vez de un dato que falta capturar. */}
              {sinPeriodicidad > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tienes{" "}
                  <span className="font-semibold text-foreground">
                    {sinPeriodicidad}
                  </span>{" "}
                  {sinPeriodicidad === 1 ? "entrega" : "entregas"} sin
                  clasificar; {sinPeriodicidad === 1 ? "aparece" : "aparecen"}{" "}
                  en «Todas». Al reagendarlas puedes indicar cada cuánto
                  pagarán.
                </p>
              )}
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
                  reciboDeParada(nombreApp, confirmando)
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
