"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ReciboEntregaPanel,
  type ContrataEntregada,
} from "@/components/contratas/recibo-entrega";
import { ReciboOtrasLiquidadasPanel } from "@/components/contratas/recibo-otras-liquidadas";
import type { ContrataResumenCobro } from "@/lib/services/cobros";
import { rutas } from "@/lib/rutas";
import { PresentacionCliente } from "@/components/clientes/presentacion-cliente";

export type ContrataCreada = ContrataEntregada & {
  id: string;
  /** Presente cuando se creó con "incluir otras contratas" marcado. */
  otrasLiquidadas?: ContrataResumenCobro[];
};

/**
 * Panel de confirmación tras registrar una contrata: ofrece mandarle al
 * cliente los detalles (monto, abono y calendario de pagos) por WhatsApp en
 * el momento de la entrega, sin tener que buscar la contrata después. Mismo
 * detalle que al renovar/unificar (ver recibo-entrega.tsx) — aquí solo se
 * agregan los botones de navegación propios de "nueva contrata".
 *
 * Si además se cobró algo de sus otras contratas (checkbox "incluir
 * otras"), se ofrece un SEGUNDO recibo aparte con ese cobro —
 * `ReciboOtrasLiquidadasPanel` — porque el comprobante de arriba solo
 * describe los términos de esta contrata, no lo que se descontó de las
 * demás.
 */
export function ContrataCreadaPanel({
  nombreApp,
  contrata,
  auto,
  clienteNuevo = false,
}: {
  nombreApp: string;
  contrata: ContrataCreada;
  /** El cliente se dio de alta junto con esta contrata: se ofrece su presentación. */
  clienteNuevo?: boolean;
  /** Con WhatsApp automático: clave de la operación para seguir el envío (el manual queda de respaldo). */
  auto?: { ownerId: string | null | undefined; clave: string | null };
}) {
  return (
    <div className="space-y-4">
      {clienteNuevo && <PresentacionCliente cliente={contrata.cliente} />}
      <ReciboEntregaPanel
        nombreApp={nombreApp}
        contrata={contrata}
        tituloPanel="Contrata registrada"
        tituloMensaje="Detalles de tu contrata"
        auto={auto}
        descuentos={{ cobroOtras: Math.round((contrata.otrasLiquidadas ?? []).reduce((s, c) => s + c.subtotal, 0) * 100) / 100 }}
      />

      <ReciboOtrasLiquidadasPanel
        nombreApp={nombreApp}
        clienteNombre={contrata.cliente.nombre}
        clienteTelefono={contrata.cliente.telefono}
        otrasLiquidadas={contrata.otrasLiquidadas ?? []}
        auto={auto}
      />

      <Button variant="outline" className="w-full" asChild>
        <Link href={rutas.contrata(contrata.id)}>Ver la contrata</Link>
      </Button>
      <Button variant="ghost" className="w-full" asChild>
        <Link href="/contratas">Volver a contratas</Link>
      </Button>
    </div>
  );
}
