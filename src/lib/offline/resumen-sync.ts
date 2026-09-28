import type { EstadoSync } from "@/lib/offline/use-estado-sync";
import { AVISO_OPERACIONES_LOCALES, LIMITE_OPERACIONES_LOCALES } from "@/lib/offline/modo-local";

/**
 * Qué muestra el botón de sincronización del encabezado. Función pura (sin
 * React) para poder probar cada combinación de estados.
 *
 * Prioridad, de lo que más le urge saber al cobrador a lo que menos:
 * descarga en curso → algo por revisar → modo local → enviando → sin
 * señal → señal débil → pendiente de reintento → al día.
 */

export type Icono = "descargando" | "revisar" | "local" | "enviando" | "sin-senal" | "debil" | "espera" | "ok";
export type Tono = "ok" | "neutro" | "aviso" | "error";

export type ResumenSync = {
  icono: Icono;
  tono: Tono;
  etiqueta: string;
  /** Punto de atención: hay algo que conviene hacer (p. ej. subir lo capturado). */
  sugerencia: boolean;
};

/** A partir de aquí los datos se consideran viejos y se avisa. */
export const DATOS_VIEJOS_MS = 12 * 60 * 60 * 1000;

export function resumirEstado(
  e: EstadoSync,
  descarga: { pct: number } | null,
  ahora: number = Date.now()
): ResumenSync {
  const enCola = e.pendientes + e.conflictos;
  const cercaDelLimite = enCola >= AVISO_OPERACIONES_LOCALES;
  const contador = `${enCola}/${LIMITE_OPERACIONES_LOCALES}`;

  if (descarga) {
    return { icono: "descargando", tono: "neutro", etiqueta: `Preparando ${descarga.pct}%`, sugerencia: false };
  }
  if (e.conflictos > 0) {
    return { icono: "revisar", tono: "error", etiqueta: `${e.conflictos} por revisar`, sugerencia: true };
  }
  if (e.modoLocal) {
    return {
      icono: "local",
      tono: cercaDelLimite ? "error" : "neutro",
      etiqueta: `Local · ${contador}`,
      // Hay buena señal y algo que subir: buen momento para sincronizar.
      sugerencia: e.calidad === "rapida" && e.pendientes > 0,
    };
  }
  if (e.envio.enviando && e.pendientes > 0) {
    return { icono: "enviando", tono: "neutro", etiqueta: `Subiendo ${e.pendientes}`, sugerencia: false };
  }
  if (e.calidad === "sin-red") {
    return {
      icono: "sin-senal",
      tono: cercaDelLimite ? "error" : "aviso",
      etiqueta: e.pendientes > 0 ? `Sin señal · ${contador}` : "Sin señal",
      sugerencia: false,
    };
  }
  if (e.calidad === "lenta") {
    return {
      icono: "debil",
      tono: "aviso",
      etiqueta: e.pendientes > 0 ? `Señal débil · ${e.pendientes}` : "Señal débil",
      sugerencia: false,
    };
  }
  if (e.pendientes > 0) {
    return { icono: "espera", tono: "aviso", etiqueta: `${e.pendientes} por subir`, sugerencia: false };
  }
  const viejos = e.ultimoSync === null || ahora - e.ultimoSync > DATOS_VIEJOS_MS;
  return { icono: "ok", tono: viejos ? "aviso" : "ok", etiqueta: "Al día", sugerencia: viejos };
}

/** "hace 5 min", "hace 3 h", "hace 2 días" — para la antigüedad de los datos. */
export function haceCuanto(epoch: number | null, ahora: number = Date.now()): string {
  if (epoch === null) return "nunca";
  const min = Math.floor((ahora - epoch) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}
