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
type Almacen = { getStore(): { clave: string } | undefined };

const REGISTRO = "__krediredClaveOperacion";

export function registrarAlmacen(almacen: Almacen) {
  (globalThis as Record<string, unknown>)[REGISTRO] = almacen;
}

export function claveOperacionActual(): string | null {
  const almacen = (globalThis as Record<string, unknown>)[REGISTRO] as Almacen | undefined;
  return almacen?.getStore()?.clave ?? null;
}
