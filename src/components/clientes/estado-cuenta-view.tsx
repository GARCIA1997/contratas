"use client";

import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { linkWhatsApp } from "@/lib/whatsapp";
import { mensajeEstadoCuenta } from "@/lib/mensajes-whatsapp";
import { desgloseCuotas, type EstadoContrata } from "@/lib/contrata";
import { anclarFechaCliente } from "@/lib/fechas";
import { rutas } from "@/lib/rutas";

type PagoUI = {
  numeroCuota: number;
  fechaProgramada: string;
  pagado: boolean;
  montoAbonado: number;
};

type ContrataUI = {
  id: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  pagados: number;
  total: number;
  saldo: number;
  estado: EstadoContrata;
  totalAbonado: number;
  pagos: PagoUI[];
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

/**
 * El estado de cuenta que se le manda al cliente solo incluye lo que sigue
 * vivo: una contrata liquidada hace un año no le dice nada y solo alarga el
 * mensaje. Los totales se recalculan sobre ese mismo subconjunto — si no,
 * las cifras de arriba no cuadrarían con el listado de abajo.
 */
function construirMensaje(nombreApp: string, c: EstadoCuentaUI) {
  const activas = c.contratas.filter(
    (ct) => ct.estado !== "LIQUIDADA" && ct.estado !== "EN_DEUDA"
  );
  const totales = activas.reduce(
    (acc, ct) => ({
      capitalPrestado: acc.capitalPrestado + ct.monto,
      totalAbonado: acc.totalAbonado + ct.totalAbonado,
      saldoPendiente: acc.saldoPendiente + ct.saldo,
    }),
    { capitalPrestado: 0, totalAbonado: 0, saldoPendiente: 0 }
  );

  return mensajeEstadoCuenta({
    nombreApp,
    clienteNombre: c.nombre,
    ...totales,
    contratas: activas.map((ct) => {
      const { atrasadas, incompletas } = desgloseCuotas(
        ct.pagos.map((p) => ({
          numeroCuota: p.numeroCuota,
          fechaProgramada: anclarFechaCliente(p.fechaProgramada),
          pagado: p.pagado,
          montoAbonado: p.montoAbonado,
        })),
        ct.abono
      );
      return {
        tipo: ct.tipo,
        montoContrata: ct.monto,
        cuotasPagadas: ct.pagados,
        numCuotas: ct.total,
        saldo: ct.saldo,
        atrasada: ct.estado === "VENCIDO",
        atrasadas,
        incompletas,
      };
    }),
  });
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
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={rutas.cliente(cliente.id)}>
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
                  href={rutas.contrata(c.id)}
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
