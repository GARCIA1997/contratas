"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { linkWhatsApp } from "@/lib/whatsapp";
import { estadoContrata, desgloseCuotas } from "@/lib/contrata";

type PagoUI = {
  numeroCuota: number;
  fechaProgramada: string;
  fechaPago: string | null;
  pagado: boolean;
  montoAbonado: number;
};

type ReciboContrata = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  cuotasPagadas: number;
  totalEsperado: number;
  totalAbonado: number;
  saldo: number;
  convertidaADeuda: boolean;
  pagos: PagoUI[];
};

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

function fecha(iso: string) {
  return format(anclarFechaCliente(iso), "d MMM yyyy", { locale: es });
}

/** Como `fecha()` pero para un Date ya anclado (evita re-anclar dos veces). */
function fechaDeDate(d: Date) {
  return format(d, "d MMM yyyy", { locale: es });
}

const DIVISOR = "──────────────";

function construirMensaje(nombreApp: string, c: ReciboContrata) {
  const estado = c.convertidaADeuda
    ? "EN_DEUDA"
    : estadoContrata(
        c.pagos.map((p) => ({
          fechaProgramada: anclarFechaCliente(p.fechaProgramada),
          pagado: p.pagado,
        }))
      );
  const activa = estado !== "LIQUIDADA" && estado !== "EN_DEUDA";

  const lineas = [
    `🧾 *${nombreApp}*`,
    `*Recibo de pago*`,
    ``,
    `👤 Cliente: ${c.clienteNombre}`,
    `📋 Contrata: ${TIPO_LABEL[c.tipo]}`,
    DIVISOR,
    `💰 Monto prestado: ${formatMoneda(c.monto)}`,
    `📆 Abono por cuota: ${formatMoneda(c.abono)}`,
    `✅ Cuotas pagadas: ${c.cuotasPagadas}/${c.numCuotas}`,
  ];

  if (activa) {
    const { atrasadas, incompletas } = desgloseCuotas(
      c.pagos.map((p) => ({
        numeroCuota: p.numeroCuota,
        fechaProgramada: anclarFechaCliente(p.fechaProgramada),
        pagado: p.pagado,
        montoAbonado: p.montoAbonado,
      })),
      c.abono
    );

    if (atrasadas.length > 0) {
      lineas.push(DIVISOR, `⚠️ *Cuotas atrasadas:*`);
      atrasadas.forEach((a) => {
        lineas.push(`Cuota ${a.numeroCuota} — ${fechaDeDate(a.fechaProgramada)}`);
      });
    }

    if (incompletas.length > 0) {
      lineas.push(DIVISOR, `🔸 *Cuotas incompletas:*`);
      incompletas.forEach((inc) => {
        lineas.push(
          `Cuota ${inc.numeroCuota} — abonado ${formatMoneda(inc.montoAbonado)} (falta ${formatMoneda(inc.faltante)})`
        );
      });
    }
  }

  return lineas.join("\n");
}

export function ReciboView({
  nombreApp,
  contrata,
}: {
  nombreApp: string;
  contrata: ReciboContrata;
}) {
  const mensaje = construirMensaje(nombreApp, contrata);
  const telefono = contrata.clienteTelefono;
  const link = linkWhatsApp(telefono, mensaje);

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/contratas/${contrata.id}`}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recibo de pago</h1>
        <p className="text-sm text-muted-foreground">
          {contrata.clienteNombre} ·{" "}
          {TIPO_LABEL[contrata.tipo]}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total abonado</p>
              <p className="text-lg font-bold text-pagado">
                {formatMoneda(contrata.totalAbonado)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo pendiente</p>
              <p className="text-lg font-bold text-primary">
                {formatMoneda(contrata.saldo)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t pt-3 text-center text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Cuotas pagadas</p>
              <p className="font-semibold">
                {contrata.cuotasPagadas}/{contrata.numCuotas}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total del plan</p>
              <p className="font-semibold">
                {formatMoneda(contrata.totalEsperado)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Detalle por cuota
        </h2>
        <ul className="space-y-1.5">
          {contrata.pagos.map((p) => (
            <li
              key={p.numeroCuota}
              className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">
                  {p.numeroCuota}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {fecha(p.fechaProgramada)}
                  </p>
                  {p.montoAbonado > 0 && (
                    <p className="truncate text-xs text-muted-foreground">
                      Abonado {formatMoneda(p.montoAbonado)}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {p.pagado ? (
                  <span className="text-xs font-semibold text-pagado">Pagado</span>
                ) : p.montoAbonado > 0 ? (
                  <span className="text-xs font-semibold text-amber-600">Parcial</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Pendiente</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Button className="w-full" asChild>
        <a href={link} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" />
          {telefono ? "Enviar recibo por WhatsApp" : "Compartir por WhatsApp"}
        </a>
      </Button>
      {!telefono && (
        <p className="text-center text-xs text-muted-foreground">
          Este cliente no tiene teléfono guardado: elige el contacto al abrir
          WhatsApp.
        </p>
      )}

      <Button variant="outline" className="w-full" asChild>
        <Link href={`/clientes/${contrata.clienteId}/estado-cuenta`}>
          Ver estado de cuenta completo del cliente
        </Link>
      </Button>
    </div>
  );
}
