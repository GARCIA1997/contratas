"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ReciboEntregaPanel,
  type ContrataEntregada,
} from "@/components/contratas/recibo-entrega";

export type ContrataCreada = ContrataEntregada & { id: string };

/**
 * Panel de confirmación tras registrar una contrata: ofrece mandarle al
 * cliente los detalles (monto, abono y calendario de pagos) por WhatsApp en
 * el momento de la entrega, sin tener que buscar la contrata después. Mismo
 * detalle que al renovar/unificar (ver recibo-entrega.tsx) — aquí solo se
 * agregan los botones de navegación propios de "nueva contrata".
 */
export function ContrataCreadaPanel({
  nombreApp,
  contrata,
}: {
  nombreApp: string;
  contrata: ContrataCreada;
}) {
  return (
    <div className="space-y-4">
      <ReciboEntregaPanel
        nombreApp={nombreApp}
        contrata={contrata}
        tituloPanel="Contrata registrada"
        tituloMensaje="Detalles de tu contrata"
      />

      <Button variant="outline" className="w-full" asChild>
        <Link href={`/contratas/${contrata.id}`}>Ver la contrata</Link>
      </Button>
      <Button variant="ghost" className="w-full" asChild>
        <Link href="/contratas">Volver a contratas</Link>
      </Button>
    </div>
  );
}
