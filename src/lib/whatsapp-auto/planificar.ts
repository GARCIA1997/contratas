import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { anclarFechaCliente } from "@/lib/fechas";
import { DIAS_ANTICIPACION_COBRO } from "@/lib/contrata";

/**
 * Qué recordatorios tocan hoy. Usa la misma ventana que la Ruta
 * (`aggregarRutaDelDia`): el cliente recibe el aviso el mismo día en que el
 * cobrador lo ve en su ruta.
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
const GRACIA_VENCIDA_DIAS = 3;

export function recordatoriosDeCuotas(cuotas: CuotaParaPlan[], hoy: Date): RecordatorioCuota[] {
  const base = startOfDay(hoy);
  const fuera: RecordatorioCuota[] = [];
  for (const c of cuotas) {
    if (c.pagado || c.convertidaADeuda) continue;
    if (c.abono - c.montoAbonado <= 0.009) continue;
    const fecha = anclarFechaCliente(c.fechaProgramada);
    const atraso = differenceInCalendarDays(base, fecha);
    if (atraso <= 0 && base >= addDays(fecha, -DIAS_ANTICIPACION_COBRO)) {
      fuera.push({
        tipo: "POR_VENCER",
        contrataId: c.contrataId,
        numeroCuota: c.numeroCuota,
        claveDedupe: `por_vencer:${c.contrataId}:${c.numeroCuota}`,
      });
    } else if (atraso >= 1 && atraso <= GRACIA_VENCIDA_DIAS) {
      fuera.push({
        tipo: "VENCIDA",
        contrataId: c.contrataId,
        numeroCuota: c.numeroCuota,
        claveDedupe: `vencida:${c.contrataId}:${c.numeroCuota}`,
      });
    }
  }
  return fuera;
}

export const DIAS_ENTRE_RECORDATORIOS_DEUDOR = 15;

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
}): boolean {
  if (opts.saldo <= 0.009 || !opts.telefono) return false;
  const ref = [opts.creadoEn, opts.ultimoAbono, opts.ultimoRecordatorio]
    .filter((d): d is Date => d instanceof Date)
    .reduce((a, b) => (b > a ? b : a));
  return differenceInCalendarDays(opts.hoy, ref) >= DIAS_ENTRE_RECORDATORIOS_DEUDOR;
}

export function claveDeudor(deudorId: string, hoy: Date): string {
  const d = startOfDay(hoy);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `deudor:${deudorId}:${ymd}`;
}
