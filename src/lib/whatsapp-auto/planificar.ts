import { differenceInCalendarDays, startOfDay } from "date-fns";
import { anclarFechaCliente } from "@/lib/fechas";
import { AJUSTES_POR_DEFECTO, type AjustesEnvio } from "./ajustes-envio";

/**
 * Qué recordatorios tocan hoy, según los ajustes de envío de la cuenta. Con
 * los ajustes por defecto ("2 días antes", vencida al día siguiente) es la
 * misma ventana que la Ruta (`aggregarRutaDelDia`): el cliente recibe el
 * aviso el mismo día en que el cobrador lo ve en su ruta.
 */

export type CuotaParaPlan = {
  contrataId: string;
  numeroCuota: number;
  fechaProgramada: Date;
  pagado: boolean;
  montoAbonado: number;
  abono: number;
  convertidaADeuda: boolean;
};

export type RecordatorioCuota = {
  tipo: "POR_VENCER" | "VENCIDA";
  contrataId: string;
  numeroCuota: number;
  claveDedupe: string;
};

/**
 * Si el worker estuvo caído el día exacto, la vencida aún se manda unos
 * días después — pero no más: al encender la función no se avisa de golpe
 * todo el atraso viejo.
 */
export const GRACIA_VENCIDA_DIAS = 3;

/**
 * Clave del aviso "por vencer" de N días antes. El de 2 días conserva la
 * clave original: así, al desplegar o al cambiar los ajustes, no se repite
 * un aviso que el cliente ya recibió.
 */
function clavePorVencer(c: CuotaParaPlan, dias: number): string {
  const base = `por_vencer:${c.contrataId}:${c.numeroCuota}`;
  return dias === 2 ? base : `${base}:d${dias}`;
}

/** Clave del aviso de vencida: el primero conserva la clave original; las repeticiones llevan su número. */
function claveVencida(c: CuotaParaPlan, repeticion: number): string {
  const base = `vencida:${c.contrataId}:${c.numeroCuota}`;
  return repeticion === 0 ? base : `${base}:r${repeticion}`;
}

/**
 * Cada día elegido en `avisoDiasAntes` abre una ventana que llega hasta el
 * siguiente día elegido: con [2, 0] el de "2 días antes" puede salir a 2 o 1
 * día del pago (si el worker no pudo mandarlo antes) y el del mismo día solo
 * el día del pago. Lo mismo con la vencida: cada aviso tiene unos días de
 * gracia, pero nunca se encima con el siguiente.
 */
export function recordatoriosDeCuotas(
  cuotas: CuotaParaPlan[],
  hoy: Date,
  ajustes: AjustesEnvio = AJUSTES_POR_DEFECTO
): RecordatorioCuota[] {
  const base = startOfDay(hoy);
  const dias = Array.from(new Set(ajustes.avisoDiasAntes)).sort((a, b) => b - a);
  const repeticiones = ajustes.vencidaRepetirCada > 0 ? ajustes.vencidaRepeticiones : 0;
  const fuera: RecordatorioCuota[] = [];
  for (const c of cuotas) {
    if (c.pagado || c.convertidaADeuda) continue;
    if (c.abono - c.montoAbonado <= 0.009) continue;
    const fecha = anclarFechaCliente(c.fechaProgramada);
    const atraso = differenceInCalendarDays(base, fecha);

    if (atraso <= 0) {
      const faltan = -atraso;
      for (let i = 0; i < dias.length; i++) {
        const siguiente = dias[i + 1] ?? -1;
        if (faltan <= dias[i] && faltan > siguiente) {
          fuera.push({ tipo: "POR_VENCER", contrataId: c.contrataId, numeroCuota: c.numeroCuota, claveDedupe: clavePorVencer(c, dias[i]) });
          break;
        }
      }
      continue;
    }

    for (let k = 0; k <= repeticiones; k++) {
      const inicio = ajustes.vencidaDiasDespues + k * ajustes.vencidaRepetirCada;
      const finGracia = inicio + GRACIA_VENCIDA_DIAS - 1;
      const fin = k < repeticiones ? Math.min(finGracia, inicio + ajustes.vencidaRepetirCada - 1) : finGracia;
      if (atraso >= inicio && atraso <= fin) {
        fuera.push({ tipo: "VENCIDA", contrataId: c.contrataId, numeroCuota: c.numeroCuota, claveDedupe: claveVencida(c, k) });
        break;
      }
    }
  }
  return fuera;
}

export const DIAS_ENTRE_RECORDATORIOS_DEUDOR = AJUSTES_POR_DEFECTO.diasEntreDeudor;

/**
 * El deudor recibe recordatorio cada 15 días contados desde lo más reciente
 * entre su último abono y su último recordatorio (así no le llega uno a los
 * dos días de haber pagado). Sin ninguno de los dos, desde que se registró.
 */
export function deudorTocaRecordatorio(opts: {
  saldo: number;
  telefono: string | null;
  creadoEn: Date;
  ultimoAbono: Date | null;
  ultimoRecordatorio: Date | null;
  hoy: Date;
  /** Cada cuántos días (ajustes de la cuenta); por defecto 15. */
  cadaDias?: number;
}): boolean {
  if (opts.saldo <= 0.009 || !opts.telefono) return false;
  const ref = [opts.creadoEn, opts.ultimoAbono, opts.ultimoRecordatorio]
    .filter((d): d is Date => d instanceof Date)
    .reduce((a, b) => (b > a ? b : a));
  return differenceInCalendarDays(opts.hoy, ref) >= (opts.cadaDias ?? DIAS_ENTRE_RECORDATORIOS_DEUDOR);
}

export function claveDeudor(deudorId: string, hoy: Date): string {
  const d = startOfDay(hoy);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `deudor:${deudorId}:${ymd}`;
}
