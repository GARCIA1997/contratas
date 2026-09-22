"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { linkWhatsApp } from "@/lib/whatsapp";
import { mensajeCobro } from "@/lib/mensajes-whatsapp";
import type { ContrataResumenCobro } from "@/lib/services/cobros";

/**
 * Recibo aparte para lo que se cobró de las "otras contratas" del cliente
 * (checkbox "incluir otras" al renovar o al crear una contrata nueva).
 *
 * El comprobante de entrega (`ReciboEntregaPanel`) solo describe la
 * contrata que se acaba de dar — sus propios términos, no lo que además se
 * descontó de las demás. Sin esta segunda tarjeta, ese cobro se aplicaba en
 * la base pero el cliente se quedaba sin nada por escrito que lo respaldara,
 * aunque el dinero sí se le haya descontado.
 *
 * Reutiliza `mensajeCobro` — el mismo builder que usan "Cobrar pendiente" y
 * "Abonar" — para que el formato de este recibo sea idéntico al de
 * cualquier otro cobro, y no un texto inventado aparte.
 */
export function ReciboOtrasLiquidadasPanel({
  nombreApp,
  clienteNombre,
  clienteTelefono,
  otrasLiquidadas,
  fecha,
}: {
  nombreApp: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  otrasLiquidadas: ContrataResumenCobro[];
  fecha?: Date;
}) {
  if (otrasLiquidadas.length === 0) return null;

  const total =
    Math.round(otrasLiquidadas.reduce((s, c) => s + c.subtotal, 0) * 100) / 100;
  const mensaje = mensajeCobro({
    nombreApp,
    clienteNombre,
    total,
    contratas: otrasLiquidadas,
    fecha,
  });
  const link = linkWhatsApp(clienteTelefono, mensaje);

  return (
    <Card className="border-pagado/30">
      <CardContent className="space-y-1 p-4 text-sm">
        <p className="font-medium text-pagado">
          También se cobró {formatMoneda(total)} de{" "}
          {otrasLiquidadas.length === 1
            ? "su otra contrata"
            : `sus otras ${otrasLiquidadas.length} contratas`}
        </p>
        <p className="text-xs text-muted-foreground">
          Cuotas vencidas, vigentes o próximas a vencer que quedaron cubiertas
          junto con esta entrega — mándale este recibo aparte, con el
          detalle de esas cuotas.
        </p>
      </CardContent>
      <CardContent className="p-4 pt-0">
        <Button className="w-full" asChild>
          <a href={link} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" />
            {clienteTelefono
              ? "Enviar recibo de cobro por WhatsApp"
              : "Compartir recibo de cobro por WhatsApp"}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
