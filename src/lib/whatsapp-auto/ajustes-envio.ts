import { z } from "zod";

/**
 * Ajustes de envío del WhatsApp automático, por cuenta. Solo los cambia el
 * monitor (Monitor → WhatsApp → detalle). El usuario sigue encendiendo y
 * apagando cada tipo desde su Configuración; aquí se decide CUÁNDO y CUÁNTO.
 *
 * Los valores por defecto son exactamente el comportamiento original: una
 * cuenta sin tocar se comporta igual que antes.
 */
export type AjustesEnvio = {
  /** Días antes del pago en que sale "por vencer" (0 = el mismo día del pago). */
  avisoDiasAntes: number[];
  /** Primer aviso de vencida: días después del pago. */
  vencidaDiasDespues: number;
  /** Repetir el aviso de vencida cada N días (0 = no repetir). */
  vencidaRepetirCada: number;
  /** Cuántas veces más se repite (solo si `vencidaRepetirCada` > 0). */
  vencidaRepeticiones: number;
  /** Horario de recordatorios, deudores y presentación: [inicio, fin). */
  horaInicio: number;
  horaFin: number;
  diasEntreDeudor: number;
  /** Tope diario de mensajes del número (los recibos cuentan pero nunca se bloquean). */
  cupoDiario: number;
};

export const AJUSTES_POR_DEFECTO: AjustesEnvio = {
  avisoDiasAntes: [2],
  vencidaDiasDespues: 1,
  vencidaRepetirCada: 0,
  vencidaRepeticiones: 0,
  horaInicio: 9,
  horaFin: 22,
  diasEntreDeudor: 15,
  cupoDiario: 200,
};

/** Opciones que ofrece el monitor. */
export const DIAS_ANTES_POSIBLES = [3, 2, 1, 0] as const;
export const CUPO_MAXIMO = 250;

/**
 * Más avisos que esto por cuota (antes + vencida + repeticiones) es lo que
 * suele terminar en reportes de spam y restricciones del número: el monitor
 * lo advierte, no lo impide.
 */
export const AVISOS_POR_CUOTA_RIESGOSO = 3;

export const esquemaAjustes = z
  .object({
    avisoDiasAntes: z
      .array(z.number().int().min(0).max(3))
      .min(1, "Elige al menos un día para el aviso antes del pago")
      .transform((d) => Array.from(new Set(d)).sort((a, b) => b - a)),
    vencidaDiasDespues: z.number().int().min(1).max(3),
    vencidaRepetirCada: z.number().int().min(0).max(7),
    vencidaRepeticiones: z.number().int().min(0).max(5),
    horaInicio: z.number().int().min(6).max(20),
    horaFin: z.number().int().min(8).max(23),
    diasEntreDeudor: z.number().int().min(7).max(60),
    cupoDiario: z.number().int().min(20).max(CUPO_MAXIMO),
  })
  .refine((a) => a.horaFin - a.horaInicio >= 2, {
    message: "El horario debe durar al menos 2 horas",
    path: ["horaFin"],
  })
  .transform((a) => (a.vencidaRepetirCada === 0 ? { ...a, vencidaRepeticiones: 0 } : a));

/** Los ajustes de una cuenta (renglón de CuentaWhatsApp), con los por defecto si falta alguno. */
export function ajustesDe(c: Partial<AjustesEnvio> | null | undefined): AjustesEnvio {
  const dias = c?.avisoDiasAntes?.length ? c.avisoDiasAntes : AJUSTES_POR_DEFECTO.avisoDiasAntes;
  return {
    avisoDiasAntes: Array.from(new Set(dias)).sort((a, b) => b - a),
    vencidaDiasDespues: c?.vencidaDiasDespues ?? AJUSTES_POR_DEFECTO.vencidaDiasDespues,
    vencidaRepetirCada: c?.vencidaRepetirCada ?? AJUSTES_POR_DEFECTO.vencidaRepetirCada,
    vencidaRepeticiones: c?.vencidaRepetirCada ? c.vencidaRepeticiones ?? 0 : 0,
    horaInicio: c?.horaInicio ?? AJUSTES_POR_DEFECTO.horaInicio,
    horaFin: c?.horaFin ?? AJUSTES_POR_DEFECTO.horaFin,
    diasEntreDeudor: c?.diasEntreDeudor ?? AJUSTES_POR_DEFECTO.diasEntreDeudor,
    cupoDiario: c?.cupoDiario ?? AJUSTES_POR_DEFECTO.cupoDiario,
  };
}

/** Máximo de avisos que puede recibir un cliente por una cuota sin pagar. */
export function avisosPorCuota(a: AjustesEnvio): number {
  return a.avisoDiasAntes.length + 1 + (a.vencidaRepetirCada > 0 ? a.vencidaRepeticiones : 0);
}

/** Último día de atraso en que todavía puede salir un aviso de vencida. */
export function ultimoDiaVencida(a: AjustesEnvio, gracia: number): number {
  const ultimoInicio = a.vencidaDiasDespues + (a.vencidaRepetirCada > 0 ? a.vencidaRepetirCada * a.vencidaRepeticiones : 0);
  return ultimoInicio + gracia - 1;
}

/** Descripción corta para el monitor ("2 y 0 días antes · vencida al día 1, cada 3 días ×2"). */
export function resumenAjustes(a: AjustesEnvio): string {
  const antes = a.avisoDiasAntes.map((d) => (d === 0 ? "el mismo día" : `${d} día${d === 1 ? "" : "s"} antes`)).join(", ");
  const vencida =
    `vencida ${a.vencidaDiasDespues} día${a.vencidaDiasDespues === 1 ? "" : "s"} después` +
    (a.vencidaRepetirCada > 0 && a.vencidaRepeticiones > 0
      ? `, repite cada ${a.vencidaRepetirCada} día${a.vencidaRepetirCada === 1 ? "" : "s"} ×${a.vencidaRepeticiones}`
      : "");
  return `${antes} · ${vencida} · ${a.horaInicio}:00–${a.horaFin}:00 · deudores cada ${a.diasEntreDeudor} días · tope ${a.cupoDiario}/día`;
}
