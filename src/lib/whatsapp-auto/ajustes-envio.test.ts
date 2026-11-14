import { describe, expect, it } from "vitest";
import { AJUSTES_POR_DEFECTO, ajustesDe, avisosPorCuota, esquemaAjustes, type AjustesEnvio } from "./ajustes-envio";
import { deudorTocaRecordatorio, recordatoriosDeCuotas, type CuotaParaPlan } from "./planificar";
import { enHorario } from "./reglas";

/** Fecha "solo día" como la guarda la BD (medianoche UTC). */
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const local = (ymd: string, h = 12) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, h);
};

const cuota = (fecha: string, extra: Partial<CuotaParaPlan> = {}): CuotaParaPlan => ({
  contrataId: "c1",
  numeroCuota: 1,
  fechaProgramada: dia(fecha),
  pagado: false,
  montoAbonado: 0,
  abono: 250,
  convertidaADeuda: false,
  ...extra,
});

const con = (cambios: Partial<AjustesEnvio>): AjustesEnvio => ({ ...AJUSTES_POR_DEFECTO, ...cambios });

/** Clave del aviso que toca `hoy` para una cuota que vence el 20-oct, o null. */
function aviso(hoy: string, ajustes: AjustesEnvio): string | null {
  return recordatoriosDeCuotas([cuota("2026-10-20")], local(hoy), ajustes)[0]?.claveDedupe ?? null;
}

describe("ajustes por defecto = comportamiento original", () => {
  it("por vencer de 2 días antes al día del pago y vencida del día 1 al 3, con las claves de siempre", () => {
    const a = AJUSTES_POR_DEFECTO;
    expect(aviso("2026-10-17", a)).toBeNull();
    expect(["2026-10-18", "2026-10-19", "2026-10-20"].map((d) => aviso(d, a))).toEqual(Array(3).fill("por_vencer:c1:1"));
    expect(["2026-10-21", "2026-10-22", "2026-10-23"].map((d) => aviso(d, a))).toEqual(Array(3).fill("vencida:c1:1"));
    expect(aviso("2026-10-24", a)).toBeNull();
  });
  it("una cuenta sin ajustes guardados toma los de siempre", () => {
    expect(ajustesDe(null)).toEqual(AJUSTES_POR_DEFECTO);
    expect(ajustesDe({ avisoDiasAntes: [] })).toEqual(AJUSTES_POR_DEFECTO);
  });
});

describe("avisos antes del pago", () => {
  it("2 días antes y el mismo día: dos avisos, cada uno en su ventana", () => {
    const a = con({ avisoDiasAntes: [2, 0] });
    expect(aviso("2026-10-18", a)).toBe("por_vencer:c1:1");
    expect(aviso("2026-10-19", a)).toBe("por_vencer:c1:1"); // el de 2 días aún puede salir (mismo aviso, no se repite)
    expect(aviso("2026-10-20", a)).toBe("por_vencer:c1:1:d0");
  });
  it("solo 1 día antes: nada a 2 días, el aviso a 1 día o el mismo día", () => {
    const a = con({ avisoDiasAntes: [1] });
    expect(aviso("2026-10-18", a)).toBeNull();
    expect(aviso("2026-10-19", a)).toBe("por_vencer:c1:1:d1");
    expect(aviso("2026-10-20", a)).toBe("por_vencer:c1:1:d1");
  });
  it("3, 2, 1 días antes y el mismo día: un aviso distinto cada día", () => {
    const a = con({ avisoDiasAntes: [3, 2, 1, 0] });
    expect(["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"].map((d) => aviso(d, a))).toEqual([
      "por_vencer:c1:1:d3",
      "por_vencer:c1:1",
      "por_vencer:c1:1:d1",
      "por_vencer:c1:1:d0",
    ]);
  });
});

describe("avisos de vencida", () => {
  it("primero a los 2 días y repite cada 3 días dos veces más, sin encimarse", () => {
    const a = con({ vencidaDiasDespues: 2, vencidaRepetirCada: 3, vencidaRepeticiones: 2 });
    const porDia = Array.from({ length: 12 }, (_, i) => aviso(`2026-10-${21 + i}`, a));
    expect(porDia).toEqual([
      null, // 21: 1 día de atraso
      "vencida:c1:1", // 22–24
      "vencida:c1:1",
      "vencida:c1:1",
      "vencida:c1:1:r1", // 25–27
      "vencida:c1:1:r1",
      "vencida:c1:1:r1",
      "vencida:c1:1:r2", // 28–30 (gracia de la última)
      "vencida:c1:1:r2",
      "vencida:c1:1:r2",
      null,
      null,
    ]);
  });
  it("una cuota pagada ya no recibe repeticiones", () => {
    const a = con({ vencidaRepetirCada: 2, vencidaRepeticiones: 3 });
    expect(recordatoriosDeCuotas([cuota("2026-10-20", { pagado: true })], local("2026-10-25"), a)).toEqual([]);
  });
});

describe("horario, deudores y validación", () => {
  it("el horario de la cuenta decide cuándo salen los recordatorios", () => {
    expect(enHorario(local("2026-10-10", 10), 12, 20)).toBe(false);
    expect(enHorario(local("2026-10-10", 12), 12, 20)).toBe(true);
    expect(enHorario(local("2026-10-10", 20), 12, 20)).toBe(false);
  });
  it("deudores cada N días según la cuenta", () => {
    const base = { saldo: 1000, telefono: "523121128425", creadoEn: local("2026-09-01"), ultimoRecordatorio: null, hoy: local("2026-10-10") };
    expect(deudorTocaRecordatorio({ ...base, ultimoAbono: local("2026-10-01"), cadaDias: 7 })).toBe(true);
    expect(deudorTocaRecordatorio({ ...base, ultimoAbono: local("2026-10-01") })).toBe(false);
  });
  it("valida y normaliza lo que manda el monitor", () => {
    const ok = esquemaAjustes.parse({ ...AJUSTES_POR_DEFECTO, avisoDiasAntes: [0, 2, 2], vencidaRepeticiones: 3 });
    expect(ok.avisoDiasAntes).toEqual([2, 0]);
    expect(ok.vencidaRepeticiones).toBe(0); // sin "repetir cada", no hay repeticiones
    expect(() => esquemaAjustes.parse({ ...AJUSTES_POR_DEFECTO, avisoDiasAntes: [] })).toThrow();
    expect(() => esquemaAjustes.parse({ ...AJUSTES_POR_DEFECTO, horaInicio: 20, horaFin: 21 })).toThrow();
    expect(() => esquemaAjustes.parse({ ...AJUSTES_POR_DEFECTO, cupoDiario: 1000 })).toThrow();
  });
  it("cuenta cuántos avisos puede recibir un cliente por cuota", () => {
    expect(avisosPorCuota(AJUSTES_POR_DEFECTO)).toBe(2);
    expect(avisosPorCuota(con({ avisoDiasAntes: [2, 0], vencidaRepetirCada: 3, vencidaRepeticiones: 2 }))).toBe(5);
  });
});
