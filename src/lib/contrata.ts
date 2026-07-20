import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { TipoContrata } from "@prisma/client";

/**
 * Calcula el abono periódico sugerido a partir de la tasa configurada.
 * La tasa se interpreta como "abono por cada $1,000 prestados, por cada
 * pago, en un plazo de `cuotasBase` pagos" (por defecto 10, el mismo valor
 * que "Cuotas por defecto" en Configuración) — es decir, para un plazo de
 * exactamente `cuotasBase` pagos el abono sugerido es directamente
 * `(monto / 1000) * tasa`, sin ningún reparto adicional.
 *
 * Si la contrata pactada tiene más o menos plazos que `cuotasBase`, el
 * interés total pactado a `cuotasBase` escala proporcionalmente (regla de
 * tres) según cuántos pagos de más o de menos tenga: una contrata al doble
 * de plazo paga el doble de interés total, no el mismo interés repartido
 * en más pagos.
 *
 *   abonoBase    = (monto / 1000) * tasa                  (a cuotasBase pagos)
 *   interésBase  = abonoBase * cuotasBase - monto          (interés total a cuotasBase pagos)
 *   interésTotal = interésBase * (numCuotas / cuotasBase)  (regla de tres si el plazo cambia)
 *   total        = monto + interésTotal
 *   abono        = total / numCuotas
 *
 * Con numCuotas === cuotasBase esto se reduce exactamente a abonoBase.
 * El resultado es editable manualmente en el formulario.
 */
export function calcularAbono(
  monto: number,
  tipo: TipoContrata,
  tasaSemanal: number,
  tasaQuincenal: number,
  numCuotas: number,
  tasaMensual: number = 200,
  cuotasBase: number = 10
): number {
  if (monto <= 0 || numCuotas <= 0 || cuotasBase <= 0) return 0;
  const tasa =
    tipo === "SEMANAL"
      ? tasaSemanal
      : tipo === "QUINCENAL"
        ? tasaQuincenal
        : tasaMensual;
  const abonoBase = (monto / 1000) * tasa;
  const interesBase = abonoBase * cuotasBase - monto;
  const interesTotal = interesBase * (numCuotas / cuotasBase);
  const total = monto + interesTotal;
  return Math.round((total / numCuotas) * 100) / 100;
}

export type EstadoContrata =
  | "LIQUIDADA"
  | "VENCIDO"
  | "PROXIMO"
  | "AL_CORRIENTE"
  /** Saldo pendiente marcado manualmente como deuda (ver Deudor). */
  | "EN_DEUDA";

export type PagoLike = {
  fechaProgramada: Date;
  pagado: boolean;
  montoAbonado?: number;
};

const DIAS_PROXIMO_VENCIMIENTO = 3;

/** Determina el estado de una contrata según sus pagos. */
export function estadoContrata(
  pagos: PagoLike[],
  hoy: Date = new Date()
): EstadoContrata {
  const pendientes = pagos.filter((p) => !p.pagado);
  if (pendientes.length === 0) return "LIQUIDADA";

  const base = startOfDay(hoy);
  const hayVencido = pendientes.some(
    (p) => differenceInCalendarDays(startOfDay(p.fechaProgramada), base) < 0
  );
  if (hayVencido) return "VENCIDO";

  const hayProximo = pendientes.some((p) => {
    const dias = differenceInCalendarDays(startOfDay(p.fechaProgramada), base);
    return dias >= 0 && dias <= DIAS_PROXIMO_VENCIMIENTO;
  });
  if (hayProximo) return "PROXIMO";

  return "AL_CORRIENTE";
}

export type CuotaAtrasada = { numeroCuota: number; fechaProgramada: Date };
export type CuotaIncompleta = {
  numeroCuota: number;
  montoAbonado: number;
  faltante: number;
};
export type DesgloseCuotas = {
  atrasadas: CuotaAtrasada[];
  incompletas: CuotaIncompleta[];
};

/**
 * Desglose de cuotas problemáticas de una contrata: atrasadas (pendientes
 * cuya fecha ya pasó, con o sin abono parcial) e incompletas (pendientes
 * con algún abono parcial, vencidas o no). Una cuota puede aparecer en
 * ambas listas. Pensado para el mensaje de WhatsApp de recibo/estado de
 * cuenta — solo tiene sentido mostrarlo en contratas activas.
 */
export function desgloseCuotas(
  pagos: (PagoLike & { numeroCuota: number })[],
  abono: number,
  hoy: Date = new Date()
): DesgloseCuotas {
  const base = startOfDay(hoy);
  const pendientes = pagos.filter((p) => !p.pagado);

  const atrasadas = pendientes
    .filter(
      (p) => differenceInCalendarDays(startOfDay(p.fechaProgramada), base) < 0
    )
    .map((p) => ({
      numeroCuota: p.numeroCuota,
      fechaProgramada: p.fechaProgramada,
    }));

  const incompletas = pendientes
    .filter((p) => (p.montoAbonado ?? 0) > 0)
    .map((p) => ({
      numeroCuota: p.numeroCuota,
      montoAbonado: p.montoAbonado ?? 0,
      faltante: Math.round((abono - (p.montoAbonado ?? 0)) * 100) / 100,
    }));

  return { atrasadas, incompletas };
}

/**
 * Un contrato "terminó su período" cuando la fecha de la última cuota ya
 * pasó (hoy >= fecha de la cuota más alta), sin importar si se pagó o no.
 * Se usa para habilitar la opción de marcar el saldo como deuda.
 */
export function haTerminadoPeriodo(
  pagos: PagoLike[],
  hoy: Date = new Date()
): boolean {
  if (pagos.length === 0) return false;
  const ultima = pagos.reduce((max, p) =>
    p.fechaProgramada > max.fechaProgramada ? p : max
  );
  return startOfDay(ultima.fechaProgramada) <= startOfDay(hoy);
}

/**
 * Saldo pendiente = suma de (abono - montoAbonado) de cada cuota no liquidada.
 * Si no hay abonos parciales registrados (montoAbonado ausente), equivale al
 * cálculo anterior: cuotas no pagadas * abono.
 */
export function saldoPendiente(pagos: PagoLike[], abono: number): number {
  const saldo = pagos
    .filter((p) => !p.pagado)
    .reduce((s, p) => s + Math.max(abono - (p.montoAbonado ?? 0), 0), 0);
  return Math.round(saldo * 100) / 100;
}

/**
 * Cuotas "vencidas o vigentes": no pagadas y cuya fecha programada ya llegó
 * (hoy o antes) — la de la semana/quincena en curso más las atrasadas, sin
 * incluir cuotas futuras.
 */
export function cuotasVencidasOVigentes<T extends PagoLike>(
  pagos: T[],
  hoy: Date = new Date()
): T[] {
  const base = startOfDay(hoy);
  return pagos.filter(
    (p) => !p.pagado && startOfDay(p.fechaProgramada) <= base
  );
}

/**
 * Monto vencido/vigente = suma de (abono - montoAbonado) de las cuotas no
 * pagadas cuya fecha ya llegó (hoy o antes). A diferencia de
 * `saldoPendiente`, no incluye cuotas futuras.
 */
export function montoVencidoOVigente(
  pagos: PagoLike[],
  abono: number,
  hoy: Date = new Date()
): number {
  const monto = cuotasVencidasOVigentes(pagos, hoy).reduce(
    (s, p) => s + Math.max(abono - (p.montoAbonado ?? 0), 0),
    0
  );
  return Math.round(monto * 100) / 100;
}

// ---------------------------------------------------------------------------
// Puntualidad
// ---------------------------------------------------------------------------

export type PagoConFecha = {
  pagado: boolean;
  fechaProgramada: Date;
  fechaPago: Date | null;
};

export type ScorePago = "ADELANTADO" | "PUNTUAL" | "MOROSO" | "SIN_HISTORIAL";

export type ResultadoScorePago = {
  score: ScorePago;
  /** Cuotas pagadas consideradas (con fechaPago). */
  cuotasConsideradas: number;
  /** % de esas cuotas pagadas a tiempo o antes (diff <= 0 días). */
  porcentajeATiempo: number;
  /** Promedio de días de atraso (fechaPago - fechaProgramada); negativo = adelantado. */
  diasPromedioAtraso: number;
};

/**
 * Clasifica la puntualidad de pago de un cliente a partir de su historial
 * de cuotas ya pagadas (cruza todas sus contratas, activas o no — el
 * comportamiento pasado es la señal, sin importar si la contrata ya
 * terminó). Cuotas sin `fechaPago` (pendientes) no cuentan para el cálculo.
 *
 * Umbrales: se compara contra el promedio de días de atraso, con 1 día de
 * tolerancia para no penalizar variaciones menores de "mismo día".
 */
export function calcularScorePago(pagos: PagoConFecha[]): ResultadoScorePago {
  const pagadas = pagos.filter((p) => p.pagado && p.fechaPago);
  if (pagadas.length === 0) {
    return {
      score: "SIN_HISTORIAL",
      cuotasConsideradas: 0,
      porcentajeATiempo: 0,
      diasPromedioAtraso: 0,
    };
  }

  const diffs = pagadas.map((p) =>
    differenceInCalendarDays(p.fechaPago as Date, p.fechaProgramada)
  );
  const aTiempo = diffs.filter((d) => d <= 0).length;
  const promedio = diffs.reduce((s, d) => s + d, 0) / diffs.length;

  const score: ScorePago =
    promedio <= -1 ? "ADELANTADO" : promedio <= 1 ? "PUNTUAL" : "MOROSO";

  return {
    score,
    cuotasConsideradas: pagadas.length,
    porcentajeATiempo: Math.round((aTiempo / pagadas.length) * 100),
    diasPromedioAtraso: Math.round(promedio * 10) / 10,
  };
}
