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
  PRUEBA: 0,
  RECIBO: 0,
  POR_VENCER: 1,
  VENCIDA: 1,
  DEUDOR: 2,
  PRESENTACION: 3,
};

/**
 * Recibos, respuesta a quien pidió la baja y pruebas del monitor: salen a
 * cualquier hora y aunque se pase del cupo.
 */
export function esTransaccional(tipo: TipoMensajeWhatsApp): boolean {
  return tipo === "RECIBO" || tipo === "CONFIRMACION_BAJA" || tipo === "PRUEBA";
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

/**
 * Lo que se hizo sin señal sube operación por operación al sincronizar, y
 * con red lenta entre una y otra pasan más de 5 s: esos recibos esperan
 * esto para salir juntos, en un solo mensaje, igual que con señal.
 */
export const VENTANA_SINCRONIZACION_MS = 30_000;
/** Una operación capturada hace más que esto llegó por la cola offline. */
export const CAPTURA_TARDIA_MS = 60_000;

/**
 * Cuándo pueden salir los recibos de cada teléfono: hasta que pase la
 * ventana del ÚLTIMO recibo pendiente (incluidos los que aún esperan su
 * `programadoPara`). Así un recibo que llega después reinicia la espera de
 * todos y salen en un solo mensaje.
 */
export function recibosListosEn(
  pendientes: { telefono: string; creadoEn: Date; programadoPara: Date }[],
  ventanaMs: number = VENTANA_AGRUPACION_RECIBOS_MS
): Map<string, number> {
  const listo = new Map<string, number>();
  for (const r of pendientes) {
    const t = Math.max(r.creadoEn.getTime() + ventanaMs, r.programadoPara.getTime());
    listo.set(r.telefono, Math.max(listo.get(r.telefono) ?? 0, t));
  }
  return listo;
}

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

/**
 * Recibos y comprobantes siguen siendo válidos aunque salgan tarde (worker
 * caído, número desconectado o pausado): se mandan al reanudar. Solo pasado
 * este tiempo se cancelan para mandarlos a mano.
 */
export const RECIBO_VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * WhatsApp confirma cada mensaje en segundos, pero tras un corte de conexión
 * el acuse puede llegar minutos después (pasó: 3 min era poco y se reenvió un
 * recordatorio que sí había llegado). Uno "enviado" que pasó este tiempo sin
 * acuse se aparta para revisarlo; si el acuse llega después, vuelve solo a
 * "Enviado" (sesion.ts).
 */
export const SIN_ACUSE_MS = 15 * 60 * 1000;

/** Motivo con el que se apartan los que no tuvieron acuse (se reconoce al llegar tarde). */
export const MOTIVO_SIN_ACUSE = "WhatsApp no confirmó la recepción: revisa el chat antes de reenviar";

/** Un ENVIANDO más viejo que esto significa que el worker murió a medio envío. */
export const ENVIANDO_ABANDONADO_MS = 5 * 60 * 1000;

/** Sin latido del worker por más que esto se considera caído (monitor, push y aviso de la app). */
export const LATIDO_MAX_MS = 2 * 60 * 1000;
