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
export function fechaCapturaActual(ahora: Date = new Date()): Date | null {
  const almacen = (globalThis as Record<string, unknown>)[REGISTRO] as Almacen | undefined;
  const iso = almacen?.getStore()?.captura;
  if (!iso) return null;
  const f = new Date(iso);
  if (isNaN(f.getTime()) || f.getTime() > ahora.getTime() + 60_000) return null;
  if (ahora.getTime() - f.getTime() > 7 * 24 * 60 * 60 * 1000) return null;
  return f;
}
