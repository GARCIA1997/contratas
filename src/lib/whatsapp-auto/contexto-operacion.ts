/**
 * La Idempotency-Key de la petición en curso, disponible para los servicios
 * sin pasarla por cada firma. El recibo automático la usa como clave de
 * deduplicación: es única por cobro, sobrevive a los reintentos de la cola
 * offline y es la misma con la que se guardó sin señal.
 *
 * Este archivo no importa nada de Node a propósito: lo alcanzan servicios
 * que el navegador también importa (p. ej. `distribuirAbono`). El
 * AsyncLocalStorage real se registra desde el servidor
 * (`contexto-operacion-servidor.ts`, usado por `withIdempotency`).
 */
type Almacen = { getStore(): { clave: string; captura?: string | null } | undefined };

const REGISTRO = "__krediredClaveOperacion";

export function registrarAlmacen(almacen: Almacen) {
  (globalThis as Record<string, unknown>)[REGISTRO] = almacen;
}

export function claveOperacionActual(): string | null {
  const almacen = (globalThis as Record<string, unknown>)[REGISTRO] as Almacen | undefined;
  return almacen?.getStore()?.clave ?? null;
}

/**
 * Cuándo se hizo de verdad la operación: la cola offline manda la hora en
 * que se capturó (X-Fecha-Captura). Un cobro hecho sin señal el lunes y
 * sincronizado el miércoles debe salir fechado el lunes en su recibo. Solo
 * se acepta si cae en los últimos 7 días y no en el futuro (reloj mal puesto).
 */
export function fechaCapturaActual(ahora: Date = new Date(), maxDias = 7): Date | null {
  const almacen = (globalThis as Record<string, unknown>)[REGISTRO] as Almacen | undefined;
  const iso = almacen?.getStore()?.captura;
  if (!iso) return null;
  const f = new Date(iso);
  if (isNaN(f.getTime()) || f.getTime() > ahora.getTime() + 60_000) return null;
  if (ahora.getTime() - f.getTime() > maxDias * 24 * 60 * 60 * 1000) return null;
  return f;
}

/**
 * Hasta cuántos días atrás se respeta la fecha de captura para decidir QUÉ
 * se cobra (cuotas vencidas, reparto de un abono). Más holgado que el del
 * recibo: justo el caso a cubrir es el teléfono que pasó días sin señal.
 */
export const MAX_DIAS_CAPTURA_COBRO = 60;

/**
 * El "hoy" con el que se calcula un cobro: el día en que se capturó en el
 * teléfono si llegó por la cola offline, o ahora. Sin esto, un "Cobrar
 * pendiente" hecho sin señal el lunes y subido el viernes cobraba también
 * las cuotas que vencieron entre semana, que el cobrador nunca vio ni cobró.
 */
export function hoyDelCobro(ahora: Date = new Date()): Date {
  return fechaCapturaActual(ahora, MAX_DIAS_CAPTURA_COBRO) ?? ahora;
}
