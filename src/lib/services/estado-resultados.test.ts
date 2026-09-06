import { describe, expect, it } from "vitest";
import {
  aggregarEstadoResultados,
  rangoDePeriodo,
  MIN_CUOTAS_PUNTUALIDAD,
  type ContrataParaEstado,
  type PagoParaEstado,
} from "./estado-resultados";

/** Fecha calendario local, con mes 1-12 para que se lea igual que en la app. */
function d(anio: number, mes: number, dia: number) {
  return new Date(anio, mes - 1, dia);
}

const HOY = d(2026, 9, 15);

function pago(
  fechaProgramada: Date,
  opts: { pagado?: boolean; monto?: number; fechaPago?: Date | null } = {}
): PagoParaEstado {
  return {
    pagado: opts.pagado ?? false,
    montoAbonado: opts.monto ?? 0,
    fechaProgramada,
    fechaPago: opts.fechaPago ?? null,
  };
}

/**
 * Contrata de 10 cuotas de $1,100 sobre $10,000 prestados: total pactado
 * $11,000, o sea $1,000 de interés = 9.09% de cada peso cobrado.
 */
function contrata(over: Partial<ContrataParaEstado> = {}): ContrataParaEstado {
  return {
    clienteId: "c1",
    clienteNombre: "Cliente Uno",
    tipo: "SEMANAL",
    monto: 10000,
    abono: 1100,
    numCuotas: 10,
    fechaInicio: d(2026, 9, 1),
    convertidaADeuda: false,
    pagos: [pago(d(2026, 9, 8)), pago(d(2026, 9, 15))],
    ...over,
  };
}

describe("rangoDePeriodo", () => {
  it("MES cubre el mes en curso", () => {
    const r = rangoDePeriodo("MES", HOY);
    expect(r.desde!.slice(0, 7)).toBe("2026-09");
    expect(r.label.toLowerCase()).toContain("septiembre");
  });

  it("TRIMESTRE arranca dos meses antes del actual", () => {
    const r = rangoDePeriodo("TRIMESTRE", HOY);
    expect(new Date(r.desde!).getMonth()).toBe(6); // julio
    expect(r.label).toBe("Últimos 3 meses");
  });

  it("ANIO arranca el 1 de enero del año en curso", () => {
    const r = rangoDePeriodo("ANIO", HOY);
    expect(new Date(r.desde!).getMonth()).toBe(0);
    expect(r.label).toBe("Año 2026");
  });

  it("HISTORICO no recorta por fechas", () => {
    const r = rangoDePeriodo("HISTORICO", HOY);
    expect(r.desde).toBeNull();
    expect(r.hasta).toBeNull();
  });

  it("trae una frase lista para meter en una oración", () => {
    // El label a secas no sirve para esto: "En histórico entregaste…" está
    // roto, y era exactamente lo que salía antes de separar `frase`.
    expect(rangoDePeriodo("HISTORICO", HOY).frase).toBe("en todo el histórico");
    expect(rangoDePeriodo("MES", HOY).frase).toBe("en septiembre 2026");
    expect(rangoDePeriodo("TRIMESTRE", HOY).frase).toBe("en los últimos 3 meses");
    expect(rangoDePeriodo("ANIO", HOY).frase).toBe("en lo que va de 2026");
  });
});

describe("aggregarEstadoResultados · cartera", () => {
  it("suma capital activo, contratas y clientes distintos", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({ clienteId: "a", clienteNombre: "Ana" }),
        contrata({ clienteId: "a", clienteNombre: "Ana", monto: 5000 }),
        contrata({ clienteId: "b", clienteNombre: "Beto", monto: 3000 }),
      ],
      "MES",
      HOY
    );
    expect(r.cartera.capitalActivo).toBe(18000);
    expect(r.cartera.contratasActivas).toBe(3);
    expect(r.cartera.clientesActivos).toBe(2);
    expect(r.cartera.ticketPromedio).toBe(6000);
  });

  it("excluye de la cartera las liquidadas y las convertidas a deuda", () => {
    const liquidada = contrata({
      monto: 7000,
      pagos: [pago(d(2026, 8, 1), { pagado: true, monto: 1100, fechaPago: d(2026, 8, 1) })],
    });
    const enDeuda = contrata({ monto: 9000, convertidaADeuda: true });
    const r = aggregarEstadoResultados([contrata(), liquidada, enDeuda], "MES", HOY);

    expect(r.cartera.contratasActivas).toBe(1);
    expect(r.cartera.capitalActivo).toBe(10000);
    expect(r.historico.contratasLiquidadas).toBe(1);
    expect(r.historico.contratasEnDeuda).toBe(1);
    // …pero el dinero que sí se cobró antes de liquidarse cuenta al histórico.
    expect(r.historico.cobrado).toBe(1100);
  });

  it("clasifica las contratas activas en vencidas, próximas y al corriente", () => {
    const vencida = contrata({ clienteId: "v", pagos: [pago(d(2026, 9, 1))] });
    const proxima = contrata({ clienteId: "p", pagos: [pago(d(2026, 9, 16))] });
    const alCorriente = contrata({ clienteId: "o", pagos: [pago(d(2026, 12, 1))] });
    const r = aggregarEstadoResultados([vencida, proxima, alCorriente], "MES", HOY);

    expect(r.cartera.vencidas).toBe(1);
    expect(r.cartera.proximas).toBe(1);
    expect(r.cartera.alCorriente).toBe(1);
    expect(r.cartera.morosidad).toBe(33.3);
    // El saldo en riesgo es solo el de la vencida (10 cuotas pactadas × 1100
    // menos lo abonado, según saldoPendiente).
    expect(r.cartera.saldoEnRiesgo).toBeGreaterThan(0);
    expect(r.cartera.saldoEnRiesgo).toBeLessThan(r.cartera.saldoPendiente);
  });

  it("promedia solo los días de las cuotas pagadas tarde", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({
          pagos: [
            pago(d(2026, 9, 1), { pagado: true, monto: 1100, fechaPago: d(2026, 9, 3) }), // +2
            pago(d(2026, 9, 8), { pagado: true, monto: 1100, fechaPago: d(2026, 9, 8) }), // a tiempo
            pago(d(2026, 9, 15)),
          ],
        }),
      ],
      "MES",
      HOY
    );
    expect(r.cartera.diasPromedioAtraso).toBe(2);
  });

  it("deja el atraso promedio en null cuando no hay historial de pagos", () => {
    const r = aggregarEstadoResultados([contrata()], "MES", HOY);
    expect(r.cartera.diasPromedioAtraso).toBeNull();
  });
});

describe("aggregarEstadoResultados · resultado del período", () => {
  it("separa ganancia de capital recuperado con la proporción del pacto", () => {
    // $11,000 pactados sobre $10,000 → 1/11 de cada abono es interés.
    const r = aggregarEstadoResultados(
      [
        contrata({
          pagos: [pago(d(2026, 9, 8), { pagado: true, monto: 1100, fechaPago: d(2026, 9, 8) })],
        }),
      ],
      "MES",
      HOY
    );
    expect(r.resultado.cobrado).toBe(1100);
    expect(r.resultado.ganancia).toBe(100);
    expect(r.resultado.capitalRecuperado).toBe(1000);
    expect(r.resultado.margen).toBe(9.1);
  });

  it("solo cuenta lo que cae dentro del período elegido", () => {
    const contratas = [
      contrata({
        fechaInicio: d(2026, 7, 1),
        pagos: [
          pago(d(2026, 7, 8), { pagado: true, monto: 1100, fechaPago: d(2026, 7, 8) }),
          pago(d(2026, 9, 8), { pagado: true, monto: 1100, fechaPago: d(2026, 9, 8) }),
        ],
      }),
    ];

    const mes = aggregarEstadoResultados(contratas, "MES", HOY);
    expect(mes.resultado.cobrado).toBe(1100);
    expect(mes.resultado.colocado).toBe(0); // la contrata inició en julio

    const historico = aggregarEstadoResultados(contratas, "HISTORICO", HOY);
    expect(historico.resultado.cobrado).toBe(2200);
    expect(historico.resultado.colocado).toBe(10000);
    expect(historico.resultado.numColocadas).toBe(1);
  });

  it("calcula el rendimiento del período sobre el capital en la calle", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({
          pagos: [
            pago(d(2026, 9, 8), { pagado: true, monto: 1100, fechaPago: d(2026, 9, 8) }),
            pago(d(2026, 9, 22)), // sigue viva, si no no habría capital activo
          ],
        }),
      ],
      "MES",
      HOY
    );
    // 100 de ganancia sobre 10,000 de capital activo.
    expect(r.resultado.rendimientoSobreCapital).toBe(1);
  });

  it("no divide entre cero cuando no hubo cobranza", () => {
    const r = aggregarEstadoResultados([contrata()], "MES", HOY);
    expect(r.resultado.margen).toBe(0);
    expect(r.resultado.rendimientoSobreCapital).toBe(0);
    expect(r.historico.tasaRecuperacion).toBe(0);
  });
});

describe("aggregarEstadoResultados · desglose por tipo", () => {
  it("reparte capital y porcentajes entre semanal, quincenal y mensual", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({ tipo: "SEMANAL", monto: 6000 }),
        contrata({ tipo: "QUINCENAL", monto: 3000, clienteId: "b" }),
        contrata({ tipo: "MENSUAL", monto: 1000, clienteId: "c" }),
      ],
      "MES",
      HOY
    );

    const porTipo = Object.fromEntries(r.porTipo.map((t) => [t.tipo, t]));
    expect(porTipo.SEMANAL.capitalActivo).toBe(6000);
    expect(porTipo.SEMANAL.porcentajeCapital).toBe(60);
    expect(porTipo.QUINCENAL.porcentajeCapital).toBe(30);
    expect(porTipo.MENSUAL.porcentajeCapital).toBe(10);
    // Siempre vienen los tres, aunque alguno esté en cero (la dona necesita
    // las tres rebanadas para no cambiar de colores entre recargas).
    expect(r.porTipo).toHaveLength(3);
  });

  it("mantiene los tres tipos aunque no haya contratas de alguno", () => {
    const r = aggregarEstadoResultados([contrata({ tipo: "MENSUAL" })], "MES", HOY);
    const semanal = r.porTipo.find((t) => t.tipo === "SEMANAL")!;
    expect(semanal.contratasActivas).toBe(0);
    expect(semanal.porcentajeCapital).toBe(0);
    expect(semanal.morosidad).toBe(0);
  });
});

describe("aggregarEstadoResultados · serie mensual", () => {
  it("devuelve los últimos N meses, el más viejo primero", () => {
    const r = aggregarEstadoResultados([], "MES", HOY, 6);
    expect(r.serie).toHaveLength(6);
    expect(r.serie[0].mes).toBe("2026-04");
    expect(r.serie[5].mes).toBe("2026-09");
  });

  it("acomoda lo colocado y lo cobrado en el mes que les toca", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({
          fechaInicio: d(2026, 8, 3),
          pagos: [
            pago(d(2026, 8, 10), { pagado: true, monto: 1100, fechaPago: d(2026, 8, 10) }),
            pago(d(2026, 9, 10), { pagado: true, monto: 1100, fechaPago: d(2026, 9, 10) }),
          ],
        }),
      ],
      "MES",
      HOY,
      3
    );
    const agosto = r.serie.find((m) => m.mes === "2026-08")!;
    const septiembre = r.serie.find((m) => m.mes === "2026-09")!;

    expect(agosto.colocado).toBe(10000);
    expect(agosto.cobrado).toBe(1100);
    expect(agosto.ganancia).toBe(100);
    expect(septiembre.colocado).toBe(0);
    expect(septiembre.cobrado).toBe(1100);
  });

  it("ignora movimientos anteriores a la ventana de la serie", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({
          fechaInicio: d(2024, 1, 5),
          pagos: [pago(d(2024, 1, 12), { pagado: true, monto: 1100, fechaPago: d(2024, 1, 12) })],
        }),
      ],
      "MES",
      HOY,
      6
    );
    expect(r.serie.every((m) => m.colocado === 0 && m.cobrado === 0)).toBe(true);
    // Pero el histórico sí los ve.
    expect(r.historico.colocado).toBe(10000);
    expect(r.historico.cobrado).toBe(1100);
  });
});

describe("aggregarEstadoResultados · rankings", () => {
  it("ordena el top por capital activo y corta en 5", () => {
    const contratas = Array.from({ length: 7 }, (_, i) =>
      contrata({
        clienteId: `c${i}`,
        clienteNombre: `Cliente ${i}`,
        monto: (i + 1) * 1000,
      })
    );
    const r = aggregarEstadoResultados(contratas, "MES", HOY);

    expect(r.topPorMonto).toHaveLength(5);
    expect(r.topPorMonto[0].nombre).toBe("Cliente 6");
    expect(r.topPorMonto[0].capitalActivo).toBe(7000);
    expect(r.topPorMonto[4].capitalActivo).toBe(3000);
  });

  it("suma varias contratas del mismo cliente en una sola fila del top", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({ clienteId: "a", clienteNombre: "Ana", monto: 4000 }),
        contrata({ clienteId: "a", clienteNombre: "Ana", monto: 3000 }),
        contrata({ clienteId: "b", clienteNombre: "Beto", monto: 5000 }),
      ],
      "MES",
      HOY
    );
    expect(r.topPorMonto[0]).toMatchObject({
      nombre: "Ana",
      capitalActivo: 7000,
      contratasActivas: 2,
    });
    expect(r.topPorMonto[1].nombre).toBe("Beto");
  });

  it(`deja fuera del ranking de puntualidad a quien tiene menos de ${MIN_CUOTAS_PUNTUALIDAD} cuotas pagadas`, () => {
    const pagadas = (n: number, dias: number) =>
      Array.from({ length: n }, (_, i) =>
        pago(d(2026, 8, i + 1), {
          pagado: true,
          monto: 1100,
          fechaPago: d(2026, 8, i + 1 + dias),
        })
      );

    const r = aggregarEstadoResultados(
      [
        contrata({ clienteId: "puntual", clienteNombre: "Puntual", pagos: pagadas(4, 0) }),
        contrata({ clienteId: "novato", clienteNombre: "Novato", pagos: pagadas(2, 0) }),
      ],
      "MES",
      HOY
    );

    expect(r.topPorPuntualidad.map((c) => c.nombre)).toEqual(["Puntual"]);
    expect(r.topPorPuntualidad[0].porcentajeATiempo).toBe(100);
    expect(r.topPorPuntualidad[0].cuotasConsideradas).toBe(4);
  });

  it("ordena la puntualidad por % a tiempo y desempata con los días de atraso", () => {
    const conAtraso = (dias: number[]) =>
      dias.map((x, i) =>
        pago(d(2026, 8, i + 1), {
          pagado: true,
          monto: 1100,
          fechaPago: d(2026, 8, i + 1 + x),
        })
      );

    const r = aggregarEstadoResultados(
      [
        contrata({ clienteId: "a", clienteNombre: "Ana", pagos: conAtraso([0, 0, 5]) }),
        contrata({ clienteId: "b", clienteNombre: "Beto", pagos: conAtraso([0, 0, 0]) }),
        contrata({ clienteId: "c", clienteNombre: "Cami", pagos: conAtraso([3, 4, 5]) }),
      ],
      "MES",
      HOY
    );

    expect(r.topPorPuntualidad.map((c) => c.nombre)).toEqual(["Beto", "Ana", "Cami"]);
    expect(r.topPorPuntualidad[0].score).toBe("PUNTUAL");
    expect(r.topPorPuntualidad[2].score).toBe("MOROSO");
  });

  it("mide la puntualidad sobre todas las contratas del cliente, incluso las liquidadas", () => {
    const pagadas = Array.from({ length: 3 }, (_, i) =>
      pago(d(2026, 7, i + 1), { pagado: true, monto: 1100, fechaPago: d(2026, 7, i + 1) })
    );
    const r = aggregarEstadoResultados(
      [contrata({ clienteId: "a", clienteNombre: "Ana", pagos: pagadas })],
      "MES",
      HOY
    );
    // La contrata ya está liquidada (no aparece en cartera) pero su
    // comportamiento de pago sigue contando.
    expect(r.cartera.contratasActivas).toBe(0);
    expect(r.topPorPuntualidad[0].nombre).toBe("Ana");
  });
});

describe("aggregarEstadoResultados · narrativa", () => {
  it("avisa cuando no hay nada registrado", () => {
    const r = aggregarEstadoResultados([], "MES", HOY);
    expect(r.narrativa).toHaveLength(1);
    expect(r.narrativa[0]).toContain("Todavía no hay contratas");
  });

  it("describe la cartera con las cifras reales", () => {
    const r = aggregarEstadoResultados(
      [
        contrata({
          pagos: [
            pago(d(2026, 9, 8), { pagado: true, monto: 1100, fechaPago: d(2026, 9, 8) }),
            pago(d(2026, 9, 22)),
          ],
        }),
      ],
      "MES",
      HOY
    );
    const texto = r.narrativa.join(" ");
    expect(texto).toContain("$10,000");
    expect(texto).toContain("En septiembre 2026");
    expect(texto).toContain("$100 es ganancia");
    expect(r.narrativa.length).toBeGreaterThan(2);
  });

  it("arma frases correctas también en el período histórico", () => {
    const r = aggregarEstadoResultados([contrata()], "HISTORICO", HOY);
    const texto = r.narrativa.join(" ");
    expect(texto).toContain("En todo el histórico entregaste");
    expect(texto).not.toContain("En histórico");
  });

  it("escribe en singular cuando solo hay una contrata o un cliente", () => {
    const r = aggregarEstadoResultados([contrata()], "MES", HOY);
    const texto = r.narrativa.join(" ");
    expect(texto).toContain("1 contrata activa de 1 cliente");
    expect(texto).not.toContain("1 contratas");
    expect(texto).not.toContain("1 clientes");
  });

  it("marca la morosidad alta como algo que requiere atención", () => {
    const r = aggregarEstadoResultados(
      [contrata({ pagos: [pago(d(2026, 8, 1))] })],
      "MES",
      HOY
    );
    expect(r.narrativa.join(" ")).toContain("Atención a la morosidad");
  });
});
