import type { TipoMensajeWhatsApp } from "@prisma/client";

/**
 * Reglas de envío del WhatsApp automático (docs/whatsapp.md, sección 5).
 * Funciones puras: el worker las aplica y las pruebas las cubren sin BD.
 */

/** Tope diario por número. Los recibos cuentan pero nunca se bloquean. */
export const CUPO_DIARIO = 100;

/** Menor = sale primero. */
export const PRIORIDAD: Record<TipoMensajeWhatsApp, number> = {
  CONFIRMACION_BAJA: 0,
  RECIBO: 0,
  POR_VENCER: 1,
  VENCIDA: 1,
  DEUDOR: 2,
  PRESENTACION: 3,
};

/** Respuesta a quien pidió la baja y los recibos: salen a cualquier hora y aunque se pase del cupo. */
export function esTransaccional(tipo: TipoMensajeWhatsApp): boolean {
  return tipo === "RECIBO" || tipo === "CONFIRMACION_BAJA";
}

/** Ventana para recordatorios, deudores y presentación (hora local del worker: America/Mexico_City). */
export const HORA_INICIO = 9;
export const HORA_FIN = 19;

export function enHorario(ahora: Date): boolean {
  const h = ahora.getHours();
  return h >= HORA_INICIO && h < HORA_FIN;
}

/** Siguiente momento en que abre la ventana (para reprogramar lo que no cupo). */
export function siguienteApertura(ahora: Date): Date {
  const d = new Date(ahora);
  if (ahora.getHours() >= HORA_FIN) d.setDate(d.getDate() + 1);
  d.setHours(HORA_INICIO, 0, 0, 0);
  return d;
}

/**
 * Un cobro de varias cuotas (la Ruta manda una operación por cuota) o una
 * sincronización traen varios recibos del mismo cliente en segundos: se
 * esperan estos segundos para mandarlos en un solo mensaje. Corto a
 * propósito: el recibo debe llegar mientras el cobrador sigue ahí.
 */
export const VENTANA_AGRUPACION_RECIBOS_MS = 5_000;

/** Pausa aleatoria entre un mensaje y el siguiente del mismo número, en ms. */
export function espaciadoMs(tipo: TipoMensajeWhatsApp, azar: () => number = Math.random): number {
  const [min, max] =
    tipo === "PRESENTACION"
      ? [4 * 60_000, 10 * 60_000]
      : esTransaccional(tipo)
        ? [10_000, 30_000]
        : [30_000, 3 * 60_000];
  return Math.round(min + azar() * (max - min));
}

/* ── Opt-out ─────────────────────────────────────────────────────────── */

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.!¡¿?,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BAJA = new Set(["no", "baja", "stop", "alto", "ya no"]);
const ALTA = new Set(["alta", "si"]);

/**
 * Solo el mensaje COMPLETO cuenta: "no tengo dinero hoy" no es una baja.
 * Devuelve null si no es ni baja ni reactivación.
 */
export function interpretarRespuesta(texto: string | null | undefined): "baja" | "alta" | null {
  if (!texto) return null;
  const t = normalizarTexto(texto);
  if (BAJA.has(t)) return "baja";
  if (ALTA.has(t)) return "alta";
  return null;
}

/* ── Campaña de presentación ─────────────────────────────────────────── */

/** Días con envíos de la campaña tras los cuales sube la rampa. */
export const DIAS_RAMPA_INICIAL = 3;

export function cupoPresentacion(diasConEnvio: number): number {
  return diasConEnvio < DIAS_RAMPA_INICIAL ? 20 : 30;
}

/** Bajas en un día que pausan la campaña sola (más estricto al inicio). */
export function umbralFreno(diasConEnvio: number): number {
  return diasConEnvio < DIAS_RAMPA_INICIAL ? 2 : 3;
}

/* ── Pausas ──────────────────────────────────────────────────────────── */

/** Al reanudar, los recibos que esperaron más que esto se cancelan (se mandan a mano). */
export const RECIBO_VIGENCIA_MS = 24 * 60 * 60 * 1000;

/** Un ENVIANDO más viejo que esto significa que el worker murió a medio envío. */
export const ENVIANDO_ABANDONADO_MS = 5 * 60 * 1000;
