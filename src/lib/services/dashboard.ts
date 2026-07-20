import {
  endOfWeek,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  endOfDay,
  startOfDay,
  addDays,
  addMonths,
  differenceInCalendarDays,
  isWithinInterval,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import type { TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { saldoPendiente, estadoContrata } from "@/lib/contrata";

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

/** Interés efectivamente cobrado (la ganancia real, no el capital que regresa). */
export type Ganancia = {
  mes: number;
  total: number;
};

/** Un balde semanal del flujo de caja proyectado. */
export type BucketFlujo = {
  desde: string;
  hasta: string;
  monto: number;
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
  /** % de contratas activas cuyo estado es VENCIDO. */
  tasaMorosidad: number;
  /** Interés realmente cobrado (proporcional al pactado por contrata), no el capital. */
  ganancia: Ganancia;
  /**
   * Promedio de días de atraso entre cuotas pagadas tarde (fechaPago >
   * fechaProgramada). `null` si todavía no hay ninguna cuota pagada en el
   * historial (no hay señal); `0` si hay historial pero nunca se ha pagado
   * tarde.
   */
  diasPromedioAtraso: number | null;
  /** Abonos programados (pendientes) por cobrar en cada una de las próximas 4 semanas. */
  flujoProyectado: BucketFlujo[];
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
  /** Plazo pactado: junto con `abono` da el total pactado (abono*numCuotas), para separar interés de capital. */
  numCuotas: number;
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
  let contratasVencidas = 0;
  let saldoTotal = 0;
  let proyectadoSemana = 0;
  let proyectadoQuincena = 0;
  let proyectadoMes = 0;
  let cobradoSemana = 0;
  let cobradoQuincena = 0;
  let cobradoMes = 0;
  let cobradoTotal = 0;
  let gananciaMes = 0;
  let gananciaTotal = 0;
  let diasAtrasoSuma = 0;
  let diasAtrasoCasos = 0;
  let huboCuotasPagadas = false;
  // Dinero entregado (monto prestado) este mes, por período de la contrata.
  const montoEntregadoMes: MontoEntregado = {
    semanal: 0,
    quincenal: 0,
    mensual: 0,
    todas: 0,
  };

  // Flujo de caja proyectado: 4 baldes semanales empezando hoy, con lo que
  // falta cobrar de cuotas ya pendientes (no lo ya pagado).
  const inicioFlujo = startOfDay(hoy);
  const baldes: BucketFlujo[] = Array.from({ length: 4 }, (_, i) => {
    const desde = addDays(inicioFlujo, i * 7);
    const hasta = addDays(inicioFlujo, i * 7 + 6);
    return { desde: desde.toISOString(), hasta: hasta.toISOString(), monto: 0 };
  });

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
    // Cuánto de esta contrata es capital vs interés, para separar la
    // ganancia real del dinero que solo "regresa": el total pactado
    // (abono * numCuotas) menos el capital prestado es el interés total
    // acordado, y se asume que cada peso cobrado trae esa misma
    // proporción de interés (no hay forma de saber, cuota a cuota, cuánto
    // de un abono parcial fue "capital" vs "interés" — se reparte
    // proporcional al pacto completo).
    const totalPactado = c.abono * c.numCuotas;
    const interesPactado = Math.max(totalPactado - c.monto, 0);
    const proporcionInteres = totalPactado > 0 ? interesPactado / totalPactado : 0;

    // Cobrado: cuenta toda cuota pagada, incluso de contratas ya saldadas
    // (el dinero cobrado cuenta para el histórico aunque la contrata ya no
    // tenga cuotas pendientes).
    for (const p of c.pagos) {
      if (!p.pagado || !p.fechaPago) continue;
      huboCuotasPagadas = true;
      cobradoTotal += p.montoAbonado;
      gananciaTotal += p.montoAbonado * proporcionInteres;
      if (isWithinInterval(p.fechaPago, mes)) {
        cobradoMes += p.montoAbonado;
        gananciaMes += p.montoAbonado * proporcionInteres;
      }
      if (isWithinInterval(p.fechaPago, semana)) cobradoSemana += p.montoAbonado;
      if (isWithinInterval(p.fechaPago, quincena)) cobradoQuincena += p.montoAbonado;

      const diasAtraso = differenceInCalendarDays(
        p.fechaPago,
        p.fechaProgramada
      );
      if (diasAtraso > 0) {
        diasAtrasoSuma += diasAtraso;
        diasAtrasoCasos += 1;
      }
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

      // Flujo proyectado: solo lo que falta cobrar (cuotas pendientes),
      // repartido en los baldes semanales que le correspondan.
      if (!p.pagado) {
        const pendiente = Math.max(c.abono - p.montoAbonado, 0);
        for (const balde of baldes) {
          if (
            p.fechaProgramada >= new Date(balde.desde) &&
            p.fechaProgramada <= new Date(balde.hasta)
          ) {
            balde.monto = round(balde.monto + pendiente);
            break;
          }
        }
      }
    }

    // El resto de los KPIs operativos (capital activo, conteo de activas,
    // saldo pendiente, morosidad) solo los alimentan contratas ACTIVAS
    // (con cuotas pendientes).
    const activa = c.pagos.some((p) => !p.pagado);
    if (!activa) continue;

    contratasActivas += 1;
    capitalActivo += c.monto;
    saldoTotal += saldoPendiente(c.pagos, c.abono);
    if (estadoContrata(c.pagos) === "VENCIDO") contratasVencidas += 1;
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
    tasaMorosidad:
      contratasActivas > 0
        ? Math.round((contratasVencidas / contratasActivas) * 1000) / 10
        : 0,
    ganancia: {
      mes: round(gananciaMes),
      total: round(gananciaTotal),
    },
    diasPromedioAtraso: !huboCuotasPagadas
      ? null
      : diasAtrasoCasos === 0
        ? 0
        : Math.round((diasAtrasoSuma / diasAtrasoCasos) * 10) / 10,
    flujoProyectado: baldes,
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

// ---------------------------------------------------------------------------
// Tendencia mensual (colocado vs cobrado)
// ---------------------------------------------------------------------------

export type MesTendencia = {
  /** "2026-07" — para ordenar/comparar. */
  mes: string;
  /** "jul 2026" — para mostrar. */
  label: string;
  /** Capital prestado en contratas iniciadas ese mes. */
  colocado: number;
  /** Suma de abonos cuya fechaPago cae en ese mes. */
  cobrado: number;
};

export type ContrataParaTendencia = {
  monto: number;
  fechaInicio: Date;
  pagos: { montoAbonado: number; pagado: boolean; fechaPago: Date | null }[];
};

/**
 * Serie de los últimos `meses` (incluye el actual), más vieja primero.
 * A diferencia de `aggregateKpis`, usa TODAS las contratas sin importar si
 * ya se convirtieron a deuda o se liquidaron — lo colocado y lo cobrado
 * pasan igual, cambien de estado o no después.
 */
export function aggregateTendencia(
  contratas: ContrataParaTendencia[],
  meses: number = 6,
  hoy: Date = new Date()
): MesTendencia[] {
  const inicioMesActual = startOfMonth(hoy);
  const serie: MesTendencia[] = Array.from({ length: meses }, (_, i) => {
    const d = addMonths(inicioMesActual, -(meses - 1) + i);
    return {
      mes: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy", { locale: es }),
      colocado: 0,
      cobrado: 0,
    };
  });
  const porClave = new Map(serie.map((m) => [m.mes, m]));
  const primerMes = serie[0].mes;

  for (const c of contratas) {
    const claveInicio = format(c.fechaInicio, "yyyy-MM");
    if (claveInicio >= primerMes) {
      const bucket = porClave.get(claveInicio);
      if (bucket) bucket.colocado = round(bucket.colocado + c.monto);
    }
    for (const p of c.pagos) {
      if (!p.pagado || !p.fechaPago) continue;
      const claveCobro = format(p.fechaPago, "yyyy-MM");
      if (claveCobro < primerMes) continue;
      const bucket = porClave.get(claveCobro);
      if (bucket) bucket.cobrado = round(bucket.cobrado + p.montoAbonado);
    }
  }

  return serie;
}

/** Igual que `aggregateTendencia` pero trayendo los datos de Prisma. */
export async function computeTendencia(
  ownerId: string,
  meses: number = 6,
  hoy: Date = new Date()
): Promise<MesTendencia[]> {
  const contratas = await prisma.contrata.findMany({
    where: { ownerId },
    select: {
      monto: true,
      fechaInicio: true,
      pagos: { select: { montoAbonado: true, pagado: true, fechaPago: true } },
    },
  });
  return aggregateTendencia(contratas, meses, hoy);
}
