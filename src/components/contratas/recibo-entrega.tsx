"use client";

import { CheckCircle2, MessageCircle } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { linkWhatsApp } from "@/lib/whatsapp";
import { mensajeEntrega } from "@/lib/mensajes-whatsapp";

export type ContrataEntregada = {
  cliente: { nombre: string; telefono: string | null };
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  pagos: { numeroCuota: number; fechaProgramada: string }[];
};

/**
 * Mensaje de WhatsApp con el detalle completo de una contrata recién
 * entregada. El formato vive en `mensajes-whatsapp.ts`, junto al del resto
 * de mensajes salientes; aquí solo se traduce la forma de los datos.
 *
 * `_titulo` se conserva por compatibilidad con las 3 pantallas que entregan
 * contrata (crear, renovar, unificar) pero ya no se usa: el documento se
 * titula igual en las tres, porque para el cliente que lo recibe siempre es
 * lo mismo — el comprobante de lo que se le acaba de entregar.
 */
export function construirMensajeEntrega(
  nombreApp: string,
  c: ContrataEntregada,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _titulo?: string
): string {
  return mensajeEntrega({
    nombreApp,
    clienteNombre: c.cliente.nombre,
    tipo: c.tipo,
    monto: c.monto,
    abono: c.abono,
    numCuotas: c.numCuotas,
    pagos: c.pagos.map((p) => ({
      numeroCuota: p.numeroCuota,
      fecha: anclarFechaCliente(p.fechaProgramada),
    })),
  });
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
  const mensaje = construirMensajeEntrega(nombreApp, contrata, tituloMensaje);
  const telefono = contrata.cliente.telefono;
  const link = linkWhatsApp(telefono, mensaje);

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

      <Button className="w-full" asChild>
        <a href={link} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" />
          {telefono
            ? "Enviar detalles por WhatsApp"
            : "Compartir detalles por WhatsApp"}
        </a>
      </Button>
      {!telefono && (
        <p className="text-center text-xs text-muted-foreground">
          Este cliente no tiene teléfono guardado: elige el contacto al abrir
          WhatsApp.
        </p>
      )}
    </>
  );
}
