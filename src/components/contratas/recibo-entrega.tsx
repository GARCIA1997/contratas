"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2 } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { CompartirRecibo } from "@/components/recibo/compartir-recibo";
import { useMarcaRecibo } from "@/components/recibo/use-marca-recibo";

export type ContrataEntregada = {
  cliente: { nombre: string; telefono: string | null };
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  pagos: { numeroCuota: number; fechaProgramada: string }[];
};

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

const DIVISOR = "──────────────";

/** Cuántas fechas se listan completas antes de resumir (evita mensajes eternos). */
const MAX_FECHAS_LISTADAS = 15;

function fecha(iso: string) {
  return format(anclarFechaCliente(iso), "d MMM yyyy", { locale: es });
}

/**
 * Mensaje de WhatsApp con el detalle completo de una contrata recién
 * entregada: monto, abono, número de pagos y calendario de fechas. Es el
 * mismo formato para las 3 acciones que entregan una contrata (crear,
 * renovar, unificar) — antes cada una mandaba un mensaje distinto (o
 * ninguno); solo cambia `titulo` según cuál sea.
 */
export function construirMensajeEntrega(
  nombreApp: string,
  c: ContrataEntregada,
  titulo: string
): string {
  const total = Math.round(c.abono * c.numCuotas * 100) / 100;
  const pagos = [...c.pagos].sort((a, b) => a.numeroCuota - b.numeroCuota);

  const lineas = [
    `🧾 *${nombreApp}*`,
    `*${titulo}*`,
    ``,
    `👤 Cliente: ${c.cliente.nombre}`,
    `📋 Tipo: ${TIPO_LABEL[c.tipo]}`,
    DIVISOR,
    `💰 Monto entregado: ${formatMoneda(c.monto)}`,
    `📆 Abono por pago: ${formatMoneda(c.abono)}`,
    `🔢 Número de pagos: ${c.numCuotas}`,
    `💵 Total a pagar: *${formatMoneda(total)}*`,
    DIVISOR,
    `📅 *Fechas de pago:*`,
  ];

  if (pagos.length <= MAX_FECHAS_LISTADAS) {
    pagos.forEach((p) => {
      lineas.push(`${p.numeroCuota}. ${fecha(p.fechaProgramada)}`);
    });
  } else {
    // Plazos largos: primeras tres, el resto resumido.
    pagos.slice(0, 3).forEach((p) => {
      lineas.push(`${p.numeroCuota}. ${fecha(p.fechaProgramada)}`);
    });
    const ultimo = pagos[pagos.length - 1];
    lineas.push(
      `… y ${pagos.length - 3} pagos más, hasta el ${fecha(ultimo.fechaProgramada)}`
    );
  }

  return lineas.join("\n");
}

/**
 * Tarjeta de confirmación + botón de WhatsApp, reutilizada por las 3
 * acciones que entregan una contrata (crear, renovar, unificar) — mismo
 * detalle en las tres, solo cambian los títulos. Cada página agrega debajo
 * sus propios botones de navegación (destinos distintos en cada caso).
 */
export function ReciboEntregaPanel({
  nombreApp,
  contrata,
  tituloPanel,
  tituloMensaje,
}: {
  nombreApp: string;
  contrata: ContrataEntregada;
  /** Encabezado de la tarjeta en pantalla, p. ej. "Contrata renovada". */
  tituloPanel: string;
  /** Título dentro del mensaje de WhatsApp, p. ej. "Detalles de tu renovación". */
  tituloMensaje: string;
}) {
  const marca = useMarcaRecibo();
  const mensaje = construirMensajeEntrega(nombreApp, contrata, tituloMensaje);
  const telefono = contrata.cliente.telefono;

  return (
    <>
      <Card className="border-pagado/30">
        <CardContent className="flex flex-col items-center gap-2 p-5 text-center">
          <CheckCircle2 className="size-10 text-pagado" />
          <h2 className="text-lg font-semibold">{tituloPanel}</h2>
          <p className="text-sm text-muted-foreground">
            {contrata.cliente.nombre} · {formatMoneda(contrata.monto)} ·{" "}
            {contrata.numCuotas} pagos de {formatMoneda(contrata.abono)}
          </p>
        </CardContent>
      </Card>

      <CompartirRecibo
        etiqueta={
          telefono ? "Enviar comprobante por WhatsApp" : "Compartir comprobante"
        }
        datos={{
          variante: "entrega",
          nombreApp,
          colorPrimario: marca.colorPrimario,
          hechoPor: marca.hechoPor,
          clienteNombre: contrata.cliente.nombre,
          fecha: new Date(),
          tipo: contrata.tipo,
          monto: contrata.monto,
          abono: contrata.abono,
          numCuotas: contrata.numCuotas,
          fechasPago: contrata.pagos.map((p) => ({
            numeroCuota: p.numeroCuota,
            fecha: fecha(p.fechaProgramada),
          })),
        }}
        logoUrl={marca.logoUrl}
        telefono={telefono}
        textoFallback={mensaje}
      />
      {!telefono && (
        <p className="text-center text-xs text-muted-foreground">
          Este cliente no tiene teléfono guardado: elige el contacto al abrir
          WhatsApp.
        </p>
      )}
    </>
  );
}
