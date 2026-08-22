"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { desgloseCuotas, type EstadoContrata } from "@/lib/contrata";
import { CompartirRecibo } from "@/components/recibo/compartir-recibo";
import { useMarcaRecibo } from "@/components/recibo/use-marca-recibo";
import { anclarFechaCliente } from "@/lib/fechas";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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

const DIVISOR = "──────────────";

function fechaDeDate(d: Date) {
  return format(d, "d MMM yyyy", { locale: es });
}

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
        `${i + 1}. ${TIPO_LABEL[ct.tipo]} — ${ct.pagados}/${ct.total} cuotas — Monto: ${formatMoneda(ct.monto)}`
      );

      const activa = ct.estado !== "LIQUIDADA" && ct.estado !== "EN_DEUDA";
      if (!activa) return;

      const { atrasadas, incompletas } = desgloseCuotas(
        ct.pagos.map((p) => ({
          numeroCuota: p.numeroCuota,
          fechaProgramada: anclarFechaCliente(p.fechaProgramada),
          pagado: p.pagado,
          montoAbonado: p.montoAbonado,
        })),
        ct.abono
      );

      if (atrasadas.length > 0) {
        const detalle = atrasadas
          .map((a) => `Cuota ${a.numeroCuota} (${fechaDeDate(a.fechaProgramada)})`)
          .join(", ");
        lineas.push(`   ⚠️ Atrasadas: ${detalle}`);
      }
      if (incompletas.length > 0) {
        const detalle = incompletas
          .map(
            (inc) =>
              `Cuota ${inc.numeroCuota} — abonado ${formatMoneda(inc.montoAbonado)} (falta ${formatMoneda(inc.faltante)})`
          )
          .join(", ");
        lineas.push(`   🔸 Incompletas: ${detalle}`);
      }
    });
  }

  return lineas.join("\n");
}

export function EstadoCuentaView({
  nombreApp,
  cliente,
}: {
  nombreApp: string;
  cliente: EstadoCuentaUI;
}) {
  const marca = useMarcaRecibo();
  const mensaje = construirMensaje(nombreApp, cliente);
  const telefono = cliente.telefono;

  // El estado de cuenta que se le manda al cliente solo incluye lo que sigue
  // vivo: una contrata liquidada hace un año no le dice nada y solo alarga
  // el documento. Los totales se recalculan sobre este mismo subconjunto —
  // si no, las tres cifras de arriba no cuadrarían con el listado de abajo.
  const activas = cliente.contratas.filter(
    (c) => c.estado !== "LIQUIDADA" && c.estado !== "EN_DEUDA"
  );
  const totalesActivas = activas.reduce(
    (acc, c) => ({
      capitalPrestado: acc.capitalPrestado + c.monto,
      totalAbonado: acc.totalAbonado + c.totalAbonado,
      saldoPendiente: acc.saldoPendiente + c.saldo,
    }),
    { capitalPrestado: 0, totalAbonado: 0, saldoPendiente: 0 }
  );

  return (
    <div className="space-y-4 md:max-w-xl">
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

      <CompartirRecibo
        etiqueta={
          telefono ? "Enviar estado de cuenta por WhatsApp" : "Compartir estado de cuenta"
        }
        datos={{
          variante: "estado",
          nombreApp,
          colorPrimario: marca.colorPrimario,
          hechoPor: marca.hechoPor,
          clienteNombre: cliente.nombre,
          fecha: new Date(),
          capitalPrestado: totalesActivas.capitalPrestado,
          totalAbonado: totalesActivas.totalAbonado,
          saldoPendiente: totalesActivas.saldoPendiente,
          contratas: activas.map((c) => ({
            tipo: c.tipo,
            montoContrata: c.monto,
            cuotasPagadas: c.pagados,
            numCuotas: c.total,
            saldo: c.saldo,
            atrasada: c.estado === "VENCIDO",
          })),
        }}
        logoUrl={marca.logoUrl}
        telefono={telefono}
        textoFallback={mensaje}
      />
      {activas.length !== cliente.contratas.length && (
        <p className="text-center text-xs text-muted-foreground">
          El estado de cuenta que se comparte incluye solo las{" "}
          {activas.length === 1 ? "contrata activa" : `${activas.length} contratas activas`}.
        </p>
      )}
      {!telefono && (
        <p className="text-center text-xs text-muted-foreground">
          Este cliente no tiene teléfono guardado: elige el contacto al abrir
          WhatsApp.
        </p>
      )}
    </div>
  );
}
