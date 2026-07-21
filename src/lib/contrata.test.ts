import { describe, expect, it } from "vitest";
import {
  calcularAbono,
  calcularScorePago,
  construirHistorial,
  cuotasVencidasOVigentes,
  desgloseCuotas,
  estadoContrata,
  haTerminadoPeriodo,
  montoVencidoOVigente,
  saldoPendiente,
  type PagoLike,
} from "./contrata";

describe("calcularAbono", () => {
  it("con numCuotas === cuotasBase, el abono es directo (monto/1000)*tasa", () => {
    // 10000/1000 * 100 = 1000 por cuota, a 10 cuotas.
    const abono = calcularAbono(10000, "SEMANAL", 100, 100, 10, 200, 10);
    expect(abono).toBe(1000);
  });

  it("escala el interés proporcionalmente si el plazo es distinto de cuotasBase", () => {
    // A 10 cuotas: abonoBase=1000, interesBase=1000*10-10000=0 (sin interés en este caso de prueba)
    // probemos con una tasa que sí genere interés.
    const abono10 = calcularAbono(10000, "SEMANAL", 120, 100, 10, 200, 10);
    // abonoBase = 12000/10=1200; interesBase=1200*10-10000=2000
    expect(abono10).toBe(1200);
    // A 20 cuotas: interesTotal = 2000*(20/10)=4000; total=14000; abono=700
    const abono20 = calcularAbono(10000, "SEMANAL", 120, 100, 20, 200, 10);
    expect(abono20).toBe(700);
  });

  it("usa la tasa mensual para contratas MENSUAL", () => {
    const abono = calcularAbono(10000, "MENSUAL", 100, 100, 10, 200, 10);
    expect(abono).toBe(2000); // (10000/1000)*200
  });

  it("devuelve 0 si el monto, numCuotas o cuotasBase no son positivos", () => {
    expect(calcularAbono(0, "SEMANAL", 100, 100, 10)).toBe(0);
    expect(calcularAbono(10000, "SEMANAL", 100, 100, 0)).toBe(0);
    expect(calcularAbono(-500, "SEMANAL", 100, 100, 10)).toBe(0);
  });
});

describe("estadoContrata — regla vencido/próximo", () => {
  function pago(fechaProgramada: Date, pagado = false): PagoLike {
    return { fechaProgramada, pagado };
  }

  it("LIQUIDADA si no hay pagos pendientes", () => {
    const hoy = new Date(2026, 6, 20);
    expect(estadoContrata([pago(new Date(2026, 6, 1), true)], hoy)).toBe("LIQUIDADA");
  });

  it("el mismo día de vencimiento debe mostrar PROXIMO, no VENCIDO", () => {
    // Confirmado explícitamente por el usuario: una cuota con fecha de pago
    // hoy no está vencida todavía, solo lo está a partir del día siguiente.
    const hoy = new Date(2026, 6, 20, 15, 30); // 20 jul, cualquier hora del día
    const cuotaHoy = pago(new Date(2026, 6, 20));
    expect(estadoContrata([cuotaHoy], hoy)).toBe("PROXIMO");
  });

  it("un día después de la fecha programada, pasa a VENCIDO", () => {
    const hoy = new Date(2026, 6, 21);
    const cuotaAyer = pago(new Date(2026, 6, 20));
    expect(estadoContrata([cuotaAyer], hoy)).toBe("VENCIDO");
  });

  it("PROXIMO si falta 3 días o menos para el vencimiento", () => {
    const hoy = new Date(2026, 6, 20);
    const cuotaEn3Dias = pago(new Date(2026, 6, 23));
    expect(estadoContrata([cuotaEn3Dias], hoy)).toBe("PROXIMO");
  });

  it("AL_CORRIENTE si faltan más de 3 días para la próxima cuota", () => {
    const hoy = new Date(2026, 6, 20);
    const cuotaLejana = pago(new Date(2026, 6, 25));
    expect(estadoContrata([cuotaLejana], hoy)).toBe("AL_CORRIENTE");
  });

  it("VENCIDO tiene prioridad si hay una cuota vencida y otra próxima", () => {
    const hoy = new Date(2026, 6, 21);
    const cuotas = [pago(new Date(2026, 6, 20)), pago(new Date(2026, 6, 23))];
    expect(estadoContrata(cuotas, hoy)).toBe("VENCIDO");
  });

  it("es inmune a timestamps con drift de zona horaria (fecha guardada a medianoche UTC)", () => {
    // Simula un dato histórico generado cuando el servidor corría en UTC:
    // una cuota "para el 20 de julio" quedó guardada como 2026-07-20T00:00:00.000Z,
    // que en America/Mexico_City (UTC-6) cae el 19 a las 6pm si se lee sin anclar.
    const hoy = new Date(2026, 6, 20, 10, 0); // 20 jul local
    const cuotaDrifted = pago(new Date("2026-07-20T00:00:00.000Z"));
    expect(estadoContrata([cuotaDrifted], hoy)).toBe("PROXIMO");
  });
});

describe("desgloseCuotas", () => {
  it("separa atrasadas (vencidas) de incompletas (con abono parcial)", () => {
    const hoy = new Date(2026, 6, 21);
    const pagos = [
      { numeroCuota: 1, fechaProgramada: new Date(2026, 6, 20), pagado: false, montoAbonado: 500 },
      { numeroCuota: 2, fechaProgramada: new Date(2026, 6, 27), pagado: false, montoAbonado: 0 },
    ];
    const { atrasadas, incompletas } = desgloseCuotas(pagos, 1000, hoy);
    expect(atrasadas.map((a) => a.numeroCuota)).toEqual([1]);
    expect(incompletas).toEqual([{ numeroCuota: 1, montoAbonado: 500, faltante: 500 }]);
  });
});

describe("haTerminadoPeriodo", () => {
  it("true cuando la fecha de la última cuota ya llegó", () => {
    const hoy = new Date(2026, 6, 20);
    const pagos: PagoLike[] = [
      { fechaProgramada: new Date(2026, 6, 1), pagado: true },
      { fechaProgramada: new Date(2026, 6, 20), pagado: false },
    ];
    expect(haTerminadoPeriodo(pagos, hoy)).toBe(true);
  });

  it("false si la última cuota todavía no llega", () => {
    const hoy = new Date(2026, 6, 19);
    const pagos: PagoLike[] = [{ fechaProgramada: new Date(2026, 6, 20), pagado: false }];
    expect(haTerminadoPeriodo(pagos, hoy)).toBe(false);
  });

  it("false si no hay pagos", () => {
    expect(haTerminadoPeriodo([])).toBe(false);
  });
});

describe("saldoPendiente", () => {
  it("suma abono - montoAbonado de las cuotas no pagadas", () => {
    const pagos: (PagoLike & { montoAbonado?: number })[] = [
      { fechaProgramada: new Date(), pagado: false, montoAbonado: 300 },
      { fechaProgramada: new Date(), pagado: false, montoAbonado: 0 },
      { fechaProgramada: new Date(), pagado: true, montoAbonado: 1000 },
    ];
    expect(saldoPendiente(pagos, 1000)).toBe(1700);
  });
});

describe("cuotasVencidasOVigentes / montoVencidoOVigente", () => {
  it("excluye cuotas futuras", () => {
    const hoy = new Date(2026, 6, 20);
    const pagos = [
      { fechaProgramada: new Date(2026, 6, 20), pagado: false, montoAbonado: 0 },
      { fechaProgramada: new Date(2026, 6, 27), pagado: false, montoAbonado: 0 },
    ];
    const vigentes = cuotasVencidasOVigentes(pagos, hoy);
    expect(vigentes).toHaveLength(1);
    expect(montoVencidoOVigente(pagos, 1000, hoy)).toBe(1000);
  });
});

describe("calcularScorePago", () => {
  it("SIN_HISTORIAL si no hay pagos con fechaPago", () => {
    expect(calcularScorePago([]).score).toBe("SIN_HISTORIAL");
  });

  it("PUNTUAL si el promedio de atraso está entre -1 y 1 día", () => {
    const resultado = calcularScorePago([
      { pagado: true, fechaProgramada: new Date(2026, 6, 1), fechaPago: new Date(2026, 6, 1) },
      { pagado: true, fechaProgramada: new Date(2026, 6, 8), fechaPago: new Date(2026, 6, 8) },
    ]);
    expect(resultado.score).toBe("PUNTUAL");
    expect(resultado.porcentajeATiempo).toBe(100);
  });

  it("MOROSO si el promedio de atraso es mayor a 1 día", () => {
    const resultado = calcularScorePago([
      { pagado: true, fechaProgramada: new Date(2026, 6, 1), fechaPago: new Date(2026, 6, 5) },
    ]);
    expect(resultado.score).toBe("MOROSO");
  });

  it("ADELANTADO si el promedio de atraso es menor a -1 día", () => {
    const resultado = calcularScorePago([
      { pagado: true, fechaProgramada: new Date(2026, 6, 10), fechaPago: new Date(2026, 6, 5) },
    ]);
    expect(resultado.score).toBe("ADELANTADO");
  });
});

describe("construirHistorial", () => {
  it("aplana creación + pagos y ordena más reciente primero", () => {
    const eventos = construirHistorial([
      {
        id: "c1",
        tipo: "SEMANAL",
        monto: 5000,
        fechaInicio: new Date(2026, 0, 1),
        pagos: [
          { numeroCuota: 1, fechaPago: new Date(2026, 0, 8), pagado: true, montoAbonado: 600 },
          { numeroCuota: 2, fechaPago: null, pagado: false, montoAbonado: 0 },
        ],
      },
    ]);
    expect(eventos).toHaveLength(2);
    expect(eventos[0].tipo).toBe("PAGO");
    expect(eventos[1].tipo).toBe("CONTRATA_CREADA");
  });
});
