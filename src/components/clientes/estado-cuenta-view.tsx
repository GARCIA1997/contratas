"use client";

import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { linkWhatsApp } from "@/lib/whatsapp";
import type { EstadoContrata } from "@/lib/contrata";

type ContrataUI = {
  id: string;
  tipo: TipoContrata;
  numCuotas: number;
  pagados: number;
  total: number;
  saldo: number;
  estado: EstadoContrata;
  totalAbonado: number;
};

type EstadoCuentaUI = {
  id: string;
  nombre: string;
  telefono: string | null;
  contratas: ContrataUI[];
  totales: {
    capitalPrestado: number;
    totalAbonado: number;
    saldoPendiente: number;
  };
};

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

const ESTADO_LABEL: Record<EstadoContrata, string> = {
  LIQUIDADA: "Liquidada",
  VENCIDO: "Vencida",
  PROXIMO: "Próxima a vencer",
  AL_CORRIENTE: "Al corriente",
  EN_DEUDA: "En deuda",
};

const DIVISOR = "──────────────";

function construirMensaje(nombreApp: string, c: EstadoCuentaUI) {
  const lineas = [
    `🧾 *${nombreApp}*`,
    `*Estado de cuenta*`,
    ``,
    `👤 Cliente: ${c.nombre}`,
    DIVISOR,
  ];

  if (c.contratas.length === 0) {
    lineas.push("Sin contratas registradas.");
  } else {
    c.contratas.forEach((ct, i) => {
      lineas.push(
        `${i + 1}. ${TIPO_LABEL[ct.tipo]} — ${ct.pagados}/${ct.total} cuotas — Saldo: ${formatMoneda(ct.saldo)}`
      );
    });
  }

  lineas.push(
    DIVISOR,
    `💰 Capital prestado: ${formatMoneda(c.totales.capitalPrestado)}`,
    `✅ Total abonado: ${formatMoneda(c.totales.totalAbonado)}`,
    `🔸 Saldo pendiente total: *${formatMoneda(c.totales.saldoPendiente)}*`
  );

  return lineas.join("\n");
}

export function EstadoCuentaView({
  nombreApp,
  cliente,
}: {
  nombreApp: string;
  cliente: EstadoCuentaUI;
}) {
  const mensaje = construirMensaje(nombreApp, cliente);
  const telefono = cliente.telefono;
  const link = linkWhatsApp(telefono, mensaje);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/clientes/${cliente.id}`}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estado de cuenta</h1>
        <p className="text-sm text-muted-foreground">{cliente.nombre}</p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Capital prestado</p>
            <p className="text-lg font-bold">
              {formatMoneda(cliente.totales.capitalPrestado)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total abonado</p>
            <p className="text-lg font-bold text-pagado">
              {formatMoneda(cliente.totales.totalAbonado)}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
            <p className="text-lg font-bold text-primary">
              {formatMoneda(cliente.totales.saldoPendiente)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Contratas
        </h2>
        {cliente.contratas.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Este cliente no tiene contratas registradas.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {cliente.contratas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/contratas/${c.id}`}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5 transition-colors hover:bg-secondary/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {TIPO_LABEL[c.tipo]}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {ESTADO_LABEL[c.estado]}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.pagados}/{c.total} cuotas · Abonado{" "}
                      {formatMoneda(c.totalAbonado)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-primary">
                      {formatMoneda(c.saldo)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">saldo</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button className="w-full" asChild>
        <a href={link} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" />
          {telefono
            ? "Enviar estado de cuenta por WhatsApp"
            : "Compartir por WhatsApp"}
        </a>
      </Button>
      {!telefono && (
        <p className="text-center text-xs text-muted-foreground">
          Este cliente no tiene teléfono guardado: elige el contacto al abrir
          WhatsApp.
        </p>
      )}
    </div>
  );
}
