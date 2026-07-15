"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { linkWhatsApp } from "@/lib/whatsapp";

type AbonoUI = {
  id: string;
  fecha: string;
  monto: number;
  restante: number;
};

type DeudorUI = {
  id: string;
  nombre: string;
  deudaInicial: number;
  saldoActual: number;
  abonos: AbonoUI[];
};

function fecha(iso: string) {
  return format(anclarFechaCliente(iso), "d MMM yyyy", { locale: es });
}

const DIVISOR = "──────────────";

function construirMensaje(nombreApp: string, d: DeudorUI) {
  const abonado = d.deudaInicial - d.saldoActual;
  const lineas = [
    `🧾 *${nombreApp}*`,
    `*Estado de cuenta*`,
    ``,
    `👤 ${d.nombre}`,
    DIVISOR,
    `💰 Deuda inicial: ${formatMoneda(d.deudaInicial)}`,
    `✅ Abonado: ${formatMoneda(abonado)}`,
    `🔸 Saldo restante: *${formatMoneda(d.saldoActual)}*`,
  ];

  if (d.abonos.length > 0) {
    lineas.push(DIVISOR, `Historial de abonos:`);
    d.abonos.forEach((a, i) => {
      lineas.push(
        `${i + 1}. ${fecha(a.fecha)} — ${formatMoneda(a.monto)} (restante ${formatMoneda(a.restante)})`
      );
    });
  }

  return lineas.join("\n");
}

export function EstadoCuentaDeudorView({
  nombreApp,
  deudor,
}: {
  nombreApp: string;
  deudor: DeudorUI;
}) {
  const mensaje = construirMensaje(nombreApp, deudor);
  const link = linkWhatsApp(null, mensaje);
  const abonado = deudor.deudaInicial - deudor.saldoActual;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/deudores/${deudor.id}`}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estado de cuenta</h1>
        <p className="text-sm text-muted-foreground">{deudor.nombre}</p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Deuda inicial</p>
            <p className="font-semibold">
              {formatMoneda(deudor.deudaInicial)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Abonado</p>
            <p className="font-semibold text-pagado">
              {formatMoneda(abonado)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className="font-semibold text-vencido">
              {formatMoneda(deudor.saldoActual)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Historial de abonos
        </h2>
        {deudor.abonos.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Sin abonos todavía.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {deudor.abonos.map((a, i) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <p className="truncate text-sm font-medium">
                    {fecha(a.fecha)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-pagado">
                    {formatMoneda(a.monto)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    restante {formatMoneda(a.restante)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button className="w-full" asChild>
        <a href={link} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" />
          Compartir por WhatsApp
        </a>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Elige el contacto al abrir WhatsApp.
      </p>
    </div>
  );
}
