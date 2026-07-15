import {
  endOfWeek,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  endOfDay,
  isWithinInterval,
} from "date-fns";
import type { TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { saldoPendiente } from "@/lib/contrata";

export type FiltroDashboard = "TODAS" | "SEMANAL" | "QUINCENAL" | "MENSUAL";

export type MontoEntregado = {
  semanal: number;
  quincenal: number;
  mensual: number;
  todas: number;
};

/** Dinero efectivamente cobrado (cuotas pagadas), por ventana de tiempo. */
export type Cobrado = {
  semana: number;
  quincena: number;
  mes: number;
  total: number;
};

/** Total programado a cobrar (pagado o no), por ventana de tiempo. */
export type Proyectado = {
  semana: number;
  quincena: number;
  mes: number;
};

export type Kpis = {
  capitalActivo: number;
  contratasActivas: number;
  saldoPendiente: number;
  /** Programado a cobrar según calendario de cuotas, por ventana de tiempo. */
  proyectado: Proyectado;
  /** Dinero ya cobrado, desglosado por semana/quincena/mes en curso y total histórico. */
  cobrado: Cobrado;
  /** Dinero entregado (monto de contratas) durante el mes en curso, por período. */
  montoEntregadoMes: MontoEntregado;
};

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Rango de la quincena calendario en curso: días 1-15 o 16-fin de mes. */
function quincenaActual(hoy: Date) {
  const dia = hoy.getDate();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  if (dia <= 15) {
    return { start: startOfMonth(hoy), end: endOfDay(new Date(anio, mes, 15)) };
  }
  return { start: new Date(anio, mes, 16), end: endOfMonth(hoy) };
}

export type ContrataParaKpis = {
  tipo: TipoContrata;
  monto: number;
  abono: number;
  fechaInicio: Date;
  pagos: {
    pagado: boolean;
    montoAbonado: number;
    fechaProgramada: Date;
    fechaPago: Date | null;
  }[];
};

/**
 * Agregación pura de KPIs a partir de las contratas ya cargadas — sin
 * Prisma. Se usa tanto en el servidor (tras el `findMany`) como en el
 * cliente offline (sobre datos de IndexedDB), para no duplicar la lógica.
 * `contratasActivasFiltradas` ya debe venir filtrada por tipo/convertidaADeuda;
 * `contratasTodas` es el universo completo (todas las convertidas o no,
 * todos los tipos) usado solo para el desglose "dinero entregado este mes".
 */
export function aggregateKpis(
  contratasActivasFiltradas: ContrataParaKpis[],
  contratasTodas: Pick<ContrataParaKpis, "tipo" | "monto" | "fechaInicio">[],
  hoy: Date = new Date()
): Kpis {
  const semana = {
    start: startOfWeek(hoy, { weekStartsOn: 1 }),
    end: endOfWeek(hoy, { weekStartsOn: 1 }),
  };
  const mes = { start: startOfMonth(hoy), end: endOfMonth(hoy) };
  const quincena = quincenaActual(hoy);

  let capitalActivo = 0;
  let contratasActivas = 0;
  let saldoTotal = 0;
  let proyectadoSemana = 0;
  let proyectadoQuincena = 0;
  let proyectadoMes = 0;
  let cobradoSemana = 0;
  let cobradoQuincena = 0;
  let cobradoMes = 0;
  let cobradoTotal = 0;
  // Dinero entregado (monto prestado) este mes, por período de la contrata.
  const montoEntregadoMes: MontoEntregado = {
    semanal: 0,
    quincenal: 0,
    mensual: 0,
    todas: 0,
  };

  for (const c of contratasTodas) {
    if (!isWithinInterval(c.fechaInicio, mes)) continue;
    montoEntregadoMes.todas = round(montoEntregadoMes.todas + c.monto);
    if (c.tipo === "SEMANAL") {
      montoEntregadoMes.semanal = round(montoEntregadoMes.semanal + c.monto);
    } else if (c.tipo === "QUINCENAL") {
      montoEntregadoMes.quincenal = round(
        montoEntregadoMes.quincenal + c.monto
      );
    } else {
      montoEntregadoMes.mensual = round(montoEntregadoMes.mensual + c.monto);
    }
  }

  for (const c of contratasActivasFiltradas) {
    // Cobrado: cuenta toda cuota pagada, incluso de contratas ya saldadas
    // (el dinero cobrado cuenta para el histórico aunque la contrata ya no
    // tenga cuotas pendientes).
    for (const p of c.pagos) {
      if (!p.pagado || !p.fechaPago) continue;
      cobradoTotal += p.montoAbonado;
      if (isWithinInterval(p.fechaPago, mes)) cobradoMes += p.montoAbonado;
      if (isWithinInterval(p.fechaPago, semana)) cobradoSemana += p.montoAbonado;
      if (isWithinInterval(p.fechaPago, quincena)) cobradoQuincena += p.montoAbonado;
    }

    // Proyectado: todas las cuotas con vencimiento programado dentro de
    // cada ventana (semana/quincena/mes en curso), pagadas o no — es lo
    // que el calendario de cuotas dice que se debería cobrar en ese lapso.
    for (const p of c.pagos) {
      if (isWithinInterval(p.fechaProgramada, semana)) {
        proyectadoSemana += c.abono;
      }
      if (isWithinInterval(p.fechaProgramada, quincena)) {
        proyectadoQuincena += c.abono;
      }
      if (isWithinInterval(p.fechaProgramada, mes)) {
        proyectadoMes += c.abono;
      }
    }

    // El resto de los KPIs operativos (capital activo, conteo de activas,
    // saldo pendiente) solo los alimentan contratas ACTIVAS (con cuotas
    // pendientes).
    const activa = c.pagos.some((p) => !p.pagado);
    if (!activa) continue;

    contratasActivas += 1;
    capitalActivo += c.monto;
    saldoTotal += saldoPendiente(c.pagos, c.abono);
  }

  return {
    capitalActivo: round(capitalActivo),
    contratasActivas,
    saldoPendiente: round(saldoTotal),
    proyectado: {
      semana: round(proyectadoSemana),
      quincena: round(proyectadoQuincena),
      mes: round(proyectadoMes),
    },
    cobrado: {
      semana: round(cobradoSemana),
      quincena: round(cobradoQuincena),
      mes: round(cobradoMes),
      total: round(cobradoTotal),
    },
    montoEntregadoMes,
  };
}

/**
 * Calcula los KPIs del dashboard para un usuario. Los TOTALES de capital,
 * contratas activas y saldo pendiente consideran ÚNICAMENTE contratas
 * activas (con al menos una cuota no marcada como pagada), y el saldo
 * pendiente solo suma el remanente de cuotas no pagadas.
 */
export async function computeKpis(
  ownerId: string,
  filtro: FiltroDashboard = "TODAS",
  hoy: Date = new Date()
): Promise<Kpis> {
  const tipo: TipoContrata | undefined =
    filtro === "TODAS" ? undefined : filtro;

  const contratas = await prisma.contrata.findMany({
    where: { ownerId, convertidaADeuda: false, ...(tipo ? { tipo } : {}) },
    include: { pagos: true },
  });

  // El desglose de dinero entregado es independiente del filtro de período
  // de la pantalla: siempre muestra semanal/quincenal/mensual/todas.
  const contratasDelMes = await prisma.contrata.findMany({
    where: { ownerId },
    select: { tipo: true, monto: true, fechaInicio: true },
  });

  return aggregateKpis(contratas, contratasDelMes, hoy);
}
