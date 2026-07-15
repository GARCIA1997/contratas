import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { TipoContrata } from "@prisma/client";

/**
 * Calcula el abono periódico sugerido a partir de la tasa configurada.
 * La tasa se interpreta como "interés total por cada $1,000 prestados,
 * en un plazo de `cuotasBase` pagos" (por defecto 10, el mismo valor que
 * "Cuotas por defecto" en Configuración).
 *
 * Si la contrata pactada tiene más o menos plazos que `cuotasBase`, el
 * interés total escala proporcionalmente (regla de tres): una contrata a
 * 20 semanas paga el doble de interés que una a 10 semanas, no el mismo
 * interés repartido en más pagos.
 *
 *   interésBase  = (monto / 1000) * tasa            (para cuotasBase pagos)
 *   interésTotal = interésBase * (numCuotas / cuotasBase)
 *   total        = monto + interésTotal
 *   abono        = total / numCuotas
 *
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
  const interesBase = (monto / 1000) * tasa;
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
