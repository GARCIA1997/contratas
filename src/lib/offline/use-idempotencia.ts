"use client";

import { useRef } from "react";

/**
 * Clave de idempotencia para las escrituras que NO pasan por la cola
 * offline (los formularios que guardan directo contra la API con red).
 *
 * El problema que cierra: sin clave, si la petición se pierde o se agota el
 * tiempo *después* de que el servidor ya la aplicó, el reintento del
 * usuario crea un duplicado — una contrata cobrada dos veces, un cliente
 * repetido. En 3G es el escenario típico: tarda tanto que la persona vuelve
 * a tocar "Guardar".
 *
 * La clave se genera al primer intento y se **conserva mientras ese intento
 * siga fallando**, para que el reintento sea reconocido como el mismo. Se
 * suelta al confirmarse, porque a partir de ahí un nuevo "Guardar" es una
 * operación genuinamente distinta que sí debe aplicarse (p. ej. editar dos
 * veces seguidas la misma contrata).
 */
export function useIdempotencia() {
  const clave = useRef<string | null>(null);

  return {
    /** Clave estable entre reintentos del mismo intento. */
    clave(): string {
      clave.current ??= crypto.randomUUID();
      return clave.current;
    },
    /** Header listo para el fetch; estable entre reintentos del mismo intento. */
    header(): Record<string, string> {
      return { "Idempotency-Key": this.clave() };
    },
    /** Llamar al confirmarse: el siguiente guardado será una operación nueva. */
    confirmado(): void {
      clave.current = null;
    },
  };
}
