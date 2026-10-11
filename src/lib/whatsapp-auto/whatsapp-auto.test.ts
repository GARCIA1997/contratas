import { describe, expect, it } from "vitest";
import { normalizarTelefono, telefonoDeJid } from "./telefono";
import {
  CUPO_DIARIO,
  PRIORIDAD,
  cupoPresentacion,
  enHorario,
  espaciadoMs,
  esTransaccional,
  interpretarRespuesta,
  siguienteApertura,
  umbralFreno,
} from "./reglas";
import { claveDeudor, deudorTocaRecordatorio, recordatoriosDeCuotas, type CuotaParaPlan } from "./planificar";
import { lineaPresentacion, nombreRemitente, textoPresentacion } from "./textos";
import { cobroDeContrata } from "./recibos";

/** Fecha "solo día" como la guarda la BD (medianoche UTC). */
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const local = (ymd: string, h = 12) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, h);
};

describe("normalizarTelefono", () => {
  it("unifica formatos mexicanos a 52 + 10 dígitos", () => {
    expect(normalizarTelefono("312 112 8425")).toBe("523121128425");
    expect(normalizarTelefono("+52 (312) 112-8425")).toBe("523121128425");
    expect(normalizarTelefono("5213121128425")).toBe("523121128425");
    expect(normalizarTelefono("523121128425")).toBe("523121128425");
  });
  it("rechaza lo que no es teléfono", () => {
    expect(normalizarTelefono("")).toBeNull();
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono("12345")).toBeNull();
  });
  it("lee el teléfono de un JID con dispositivo", () => {
    expect(telefonoDeJid("523121128425:12@s.whatsapp.net")).toBe("523121128425");
  });
});

describe("opt-out", () => {
  it("solo cuenta el mensaje completo", () => {
    for (const t of ["NO", "no.", " Baja ", "STOP", "alto", "Ya no", "¡No!"]) {
      expect(interpretarRespuesta(t)).toBe("baja");
    }
    expect(interpretarRespuesta("no tengo dinero hoy")).toBeNull();
    expect(interpretarRespuesta("mañana le pago, no se preocupe")).toBeNull();
    expect(interpretarRespuesta("Alta")).toBe("alta");
    expect(interpretarRespuesta("Sí")).toBe("alta");
    expect(interpretarRespuesta(null)).toBeNull();
  });
});

describe("reglas de envío", () => {
  it("horario 9:00–19:00 todos los días (incluye fin de semana)", () => {
    expect(enHorario(local("2026-10-10", 8))).toBe(false);
    expect(enHorario(local("2026-10-10", 9))).toBe(true);
    expect(enHorario(local("2026-10-11", 18))).toBe(true); // domingo
    expect(enHorario(local("2026-10-10", 19))).toBe(false);
  });
  it("lo que no cupo se reprograma a la siguiente apertura", () => {
    expect(siguienteApertura(local("2026-10-10", 20)).getDate()).toBe(11);
    expect(siguienteApertura(local("2026-10-10", 7)).getHours()).toBe(9);
  });
  it("recibos primero, presentación al final; recibos y confirmaciones son transaccionales", () => {
    expect(PRIORIDAD.RECIBO).toBeLessThan(PRIORIDAD.POR_VENCER);
    expect(PRIORIDAD.POR_VENCER).toBeLessThan(PRIORIDAD.DEUDOR);
    expect(PRIORIDAD.DEUDOR).toBeLessThan(PRIORIDAD.PRESENTACION);
    expect(esTransaccional("RECIBO")).toBe(true);
    expect(esTransaccional("CONFIRMACION_BAJA")).toBe(true);
    expect(esTransaccional("PRUEBA")).toBe(true);
    expect(PRIORIDAD.PRUEBA).toBe(0);
    expect(esTransaccional("VENCIDA")).toBe(false);
    expect(CUPO_DIARIO).toBe(100);
  });
  it("espaciado dentro de los rangos acordados", () => {
    expect(espaciadoMs("RECIBO", () => 0)).toBe(10_000);
    expect(espaciadoMs("RECIBO", () => 1)).toBe(30_000);
    expect(espaciadoMs("VENCIDA", () => 1)).toBe(180_000);
    expect(espaciadoMs("PRESENTACION", () => 0)).toBe(240_000);
    expect(espaciadoMs("PRESENTACION", () => 1)).toBe(600_000);
  });
  it("rampa 20 → 30 y freno más estricto los primeros 3 días", () => {
    expect(cupoPresentacion(0)).toBe(20);
    expect(cupoPresentacion(2)).toBe(20);
    expect(cupoPresentacion(3)).toBe(30);
    expect(umbralFreno(1)).toBe(2);
    expect(umbralFreno(5)).toBe(3);
  });
});

describe("recordatoriosDeCuotas (misma ventana que la Ruta)", () => {
  const base: Omit<CuotaParaPlan, "fechaProgramada" | "numeroCuota"> = {
    contrataId: "c1",
    pagado: false,
    montoAbonado: 0,
    abono: 250,
    convertidaADeuda: false,
  };
  const cuota = (n: number, ymd: string, extra: Partial<CuotaParaPlan> = {}) => ({
    ...base,
    numeroCuota: n,
    fechaProgramada: dia(ymd),
    ...extra,
  });

  it("por vencer desde que entra a la ruta (2 días antes) hasta el día del vencimiento", () => {
    const hoy = local("2026-10-10");
    const r = recordatoriosDeCuotas(
      [cuota(1, "2026-10-12"), cuota(2, "2026-10-10"), cuota(3, "2026-10-13")],
      hoy
    );
    expect(r.map((x) => [x.numeroCuota, x.tipo])).toEqual([
      [1, "POR_VENCER"],
      [2, "POR_VENCER"],
    ]);
    expect(r[0].claveDedupe).toBe("por_vencer:c1:1");
  });

  it("vencida desde el día siguiente, con gracia de 3 días (no avisa atraso viejo)", () => {
    const hoy = local("2026-10-10");
    const r = recordatoriosDeCuotas([cuota(1, "2026-10-09"), cuota(2, "2026-10-07"), cuota(3, "2026-10-06")], hoy);
    expect(r.map((x) => [x.numeroCuota, x.tipo])).toEqual([
      [1, "VENCIDA"],
      [2, "VENCIDA"],
    ]);
    expect(r[0].claveDedupe).toBe("vencida:c1:1");
  });

  it("omite pagadas, saldadas con abonos y contratas pasadas a deuda", () => {
    const hoy = local("2026-10-10");
    expect(
      recordatoriosDeCuotas(
        [
          cuota(1, "2026-10-11", { pagado: true }),
          cuota(2, "2026-10-11", { montoAbonado: 250 }),
          cuota(3, "2026-10-09", { convertidaADeuda: true }),
        ],
        hoy
      )
    ).toEqual([]);
  });
});

describe("deudores cada 15 días", () => {
  const hoy = local("2026-10-20");
  const base = { saldo: 1000, telefono: "523121128425", creadoEn: local("2026-01-01"), ultimoAbono: null, ultimoRecordatorio: null, hoy };
  it("cuenta desde lo más reciente entre abono y recordatorio", () => {
    expect(deudorTocaRecordatorio({ ...base, ultimoAbono: local("2026-10-05") })).toBe(true);
    expect(deudorTocaRecordatorio({ ...base, ultimoAbono: local("2026-10-06") })).toBe(false);
    expect(deudorTocaRecordatorio({ ...base, ultimoAbono: local("2026-09-01"), ultimoRecordatorio: local("2026-10-10") })).toBe(false);
  });
  it("sin saldo o sin teléfono no se manda", () => {
    expect(deudorTocaRecordatorio({ ...base, saldo: 0 })).toBe(false);
    expect(deudorTocaRecordatorio({ ...base, telefono: null })).toBe(false);
  });
  it("clave única por día", () => {
    expect(claveDeudor("d1", hoy)).toBe("deudor:d1:2026-10-20");
  });
});

describe("textos", () => {
  it("la presentación rota versiones y usa el primer nombre", () => {
    const a = textoPresentacion("JUAN pérez", "Kredired", 0);
    const b = textoPresentacion("JUAN pérez", "Kredired", 1);
    expect(a).not.toBe(b);
    expect(a).toContain("Juan");
    expect(a).toContain("NO");
  });
});

describe("presentación firmada por el usuario", () => {
  it("incluye el primer nombre del dueño en todas las versiones", () => {
    for (let i = 0; i < 4; i++) {
      const t = textoPresentacion("juan pérez", "Kredired", i, "ALEJANDRO García");
      expect(t).toMatch(/Alejandro,? de Kredired/);
      expect(t).toContain("Juan");
      expect(t).toContain("NO");
    }
    expect(textoPresentacion("Juan", "Kredired", 0, "Alejandro")).toBe(
      "Hola Juan, le escribe Alejandro de Kredired. A partir de hoy recibirá sus recordatorios y comprobantes de pago desde este número. Si no desea recibir mensajes, responda NO y no le volveremos a escribir."
    );
  });
  it("la línea del primer mensaje también lo firma", () => {
    expect(lineaPresentacion("Kredired", "Alejandro")).toMatch(/^👋 Le escribe Alejandro de \*Kredired\*\./);
  });
  it("sin nombre (o si es un correo o número) habla en nombre del negocio", () => {
    expect(nombreRemitente(null)).toBeNull();
    expect(nombreRemitente("alejandro@gmail.com")).toBeNull();
    expect(nombreRemitente("3131128425")).toBeNull();
    expect(textoPresentacion("Juan", "Kredired", 0, null)).toContain("le escribimos de Kredired");
    expect(lineaPresentacion("Kredired", "  ")).toMatch(/^👋 Le escribimos de \*Kredired\*/);
  });
});

describe("cobroDeContrata", () => {
  it("calcula saldo tras el cobro y marca parciales", () => {
    const c = cobroDeContrata(
      {
        tipo: "SEMANAL",
        monto: 1000,
        abono: 250,
        pagos: [
          { numeroCuota: 1, montoAbonado: 250 },
          { numeroCuota: 2, montoAbonado: 0 },
          { numeroCuota: 3, montoAbonado: 0 },
        ],
      },
      [{ numeroCuota: 2, monto: 100, quedaPagada: false }]
    );
    expect(c.saldoTrasCobro).toBe(400);
    expect(c.cuotas[0]).toEqual({ numeroCuota: 2, monto: 100, parcial: true, faltante: 150 });
    expect(c.subtotal).toBe(100);
  });
});
