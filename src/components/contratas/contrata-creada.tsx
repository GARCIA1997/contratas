"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, MessageCircle } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { linkWhatsApp } from "@/lib/whatsapp";

export type ContrataCreada = {
  id: string;
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

export function construirMensajeEntrega(
  nombreApp: string,
  c: ContrataCreada
): string {
  const total = Math.round(c.abono * c.numCuotas * 100) / 100;
  const pagos = [...c.pagos].sort((a, b) => a.numeroCuota - b.numeroCuota);

  const lineas = [
    `🧾 *${nombreApp}*`,
    `*Detalles de tu contrata*`,
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
 * Panel de confirmación tras registrar una contrata: ofrece mandarle al
 * cliente los detalles (monto, abono y calendario de pagos) por WhatsApp en
 * el momento de la entrega, sin tener que buscar la contrata después.
 */
export function ContrataCreadaPanel({
  nombreApp,
  contrata,
}: {
  nombreApp: string;
  contrata: ContrataCreada;
}) {
  const mensaje = construirMensajeEntrega(nombreApp, contrata);
  const telefono = contrata.cliente.telefono;
  const link = linkWhatsApp(telefono, mensaje);

  return (
    <div className="space-y-4">
      <Card className="border-pagado/30">
        <CardContent className="flex flex-col items-center gap-2 p-5 text-center">
          <CheckCircle2 className="size-10 text-pagado" />
          <h2 className="text-lg font-semibold">Contrata registrada</h2>
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

      <Button variant="outline" className="w-full" asChild>
        <Link href={`/contratas/${contrata.id}`}>Ver la contrata</Link>
      </Button>
      <Button variant="ghost" className="w-full" asChild>
        <Link href="/contratas">Volver a contratas</Link>
      </Button>
    </div>
  );
}
