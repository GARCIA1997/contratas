import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { distribuirAbono, type ContrataParaAbono, type PagoParaAbono } from "./abono";

const HOY = new Date(2026, 7, 24); // 24 ago 2026

let contadorId = 0;
function pago(
  numeroCuota: number,
  opts: { diasDesdeHoy: number; pagado?: boolean; montoAbonado?: number }
): PagoParaAbono {
  contadorId += 1;
  return {
    id: `pago-${contadorId}`,
    numeroCuota,
    pagado: opts.pagado ?? false,
    montoAbonado: opts.montoAbonado ?? 0,
    fechaProgramada: addDays(HOY, opts.diasDesdeHoy),
  };
}

function contrata(
  contrataId: string,
  abono: number,
  pagos: PagoParaAbono[]
): ContrataParaAbono {
  return {
    contrataId,
    tipo: "SEMANAL",
    // Arbitrario para las pruebas — no afecta el reparto, solo se muestra
    // como referencia en el desglose.
    monto: abono * pagos.length,
    abono,
    numCuotas: pagos.length,
    pagos,
  };
}

/**
 * Escenario base reusado por varias pruebas:
 *  - A: 1 sola cuota pendiente, la de hoy (semana). cuotasRestantes=1 → mayor prioridad.
 *  - B: cuota de hoy (semana) + 2 futuras. cuotasRestantes=3.
 *  - C: 2 atrasadas + la de hoy (semana) + 1 futura. cuotasRestantes=4 → menor prioridad.
 * Semana total = 300 (A) + 400 (B) + 200 (C) = 900.
 * Atrasadas de C = 200 + 200 = 400. Futuras de B = 400+400=800, de C = 200.
 */
function escenarioBase(): ContrataParaAbono[] {
  const a = contrata("a-cinco-pagos", 300, [
    ...[1, 2, 3, 4].map((n) => pago(n, { diasDesdeHoy: -7 * (5 - n), pagado: true })),
    pago(5, { diasDesdeHoy: 0 }),
  ]);
  const b = contrata("b-diez-pagos", 400, [
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => pago(n, { diasDesdeHoy: -7 * (8 - n), pagado: true })),
    pago(8, { diasDesdeHoy: 0 }),
    pago(9, { diasDesdeHoy: 7 }),
    pago(10, { diasDesdeHoy: 14 }),
  ]);
  const c = contrata("c-ocho-pagos", 200, [
    ...[1, 2, 3, 4].map((n) => pago(n, { diasDesdeHoy: -7 * (8 - n), pagado: true })),
    pago(5, { diasDesdeHoy: -14 }),
    pago(6, { diasDesdeHoy: -7 }),
    pago(7, { diasDesdeHoy: 0 }),
    pago(8, { diasDesdeHoy: 7 }),
  ]);
  return [a, b, c];
}

describe("distribuirAbono — etapa 1 (la semana de todas primero)", () => {
  it("con el monto exacto de la semana, cubre la cuota de hoy de las 3 contratas", () => {
    const r = distribuirAbono(escenarioBase(), 900, HOY);
    expect(r.totalAplicado).toBe(900);
    expect(r.sobranteNoAplicado).toBe(0);
    expect(r.aplicaciones).toHaveLength(3);
    expect(r.aplicaciones.every((a) => a.quedaPagada)).toBe(true);
    // Ninguna atrasada ni futura se tocó.
    expect(r.aplicaciones.map((a) => a.numeroCuota).sort()).toEqual([5, 7, 8]);
  });

  it("con menos que la semana, completa por prioridad y la última que alcanza recibe abono parcial", () => {
    // A (300) + B (400) = 700; con 650 solo alcanza para A completa + parte de B.
    const r = distribuirAbono(escenarioBase(), 650, HOY);
    expect(r.totalAplicado).toBe(650);
    expect(r.sobranteNoAplicado).toBe(0);
    expect(r.aplicaciones).toHaveLength(2);

    const deA = r.aplicaciones.find((a) => a.contrataId === "a-cinco-pagos")!;
    expect(deA.montoAplicado).toBe(300);
    expect(deA.quedaPagada).toBe(true);

    const deB = r.aplicaciones.find((a) => a.contrataId === "b-diez-pagos")!;
    expect(deB.montoAplicado).toBe(350);
    expect(deB.quedaPagada).toBe(false);

    // C (menor prioridad) no recibe nada esta vez.
    expect(r.aplicaciones.some((a) => a.contrataId === "c-ocho-pagos")).toBe(false);
  });

  it("el recibo (contratas agrupadas) solo incluye a quien recibió algo", () => {
    const r = distribuirAbono(escenarioBase(), 650, HOY);
    expect(r.contratas.map((c) => c.contrataId).sort()).toEqual([
      "a-cinco-pagos",
      "b-diez-pagos",
    ]);
  });

  it("el recibo incluye el capital prestado de cada contrata", () => {
    const r = distribuirAbono(escenarioBase(), 650, HOY);
    const deA = r.contratas.find((c) => c.contrataId === "a-cinco-pagos")!;
    // monto = abono * numCuotas por construcción del fixture (300 * 5).
    expect(deA.montoContrata).toBe(1500);
  });

  it("el recibo marca qué cuotas quedaron incompletas y cuánto les falta", () => {
    // Sin esto el recibo de WhatsApp imprimía un ✅ sobre una cuota que
    // solo recibió parte del dinero.
    const r = distribuirAbono(escenarioBase(), 650, HOY);

    const cuotaDeA = r.contratas.find((c) => c.contrataId === "a-cinco-pagos")!.cuotas[0];
    expect(cuotaDeA.monto).toBe(300);
    expect(cuotaDeA.parcial).toBeUndefined();
    expect(cuotaDeA.faltante).toBeUndefined();

    // B recibió 350 de los 400 de su cuota: quedan 50.
    const cuotaDeB = r.contratas.find((c) => c.contrataId === "b-diez-pagos")!.cuotas[0];
    expect(cuotaDeB.monto).toBe(350);
    expect(cuotaDeB.parcial).toBe(true);
    expect(cuotaDeB.faltante).toBe(50);
  });

  it("el faltante descuenta lo que la cuota ya traía abonado de antes", () => {
    // Cuota de 300 que ya tenía 100 abonados → le faltan 200. Con un abono
    // de 50, el recibo debe decir que aún le faltan 150 (no 250).
    const contratas = [
      contrata("unica", 300, [pago(1, { diasDesdeHoy: 0, montoAbonado: 100 })]),
    ];
    const r = distribuirAbono(contratas, 50, HOY);

    expect(r.aplicaciones[0].montoAplicado).toBe(50);
    expect(r.aplicaciones[0].quedaPagada).toBe(false);
    expect(r.aplicaciones[0].faltante).toBe(150);
    expect(r.contratas[0].cuotas[0]).toMatchObject({
      monto: 50,
      parcial: true,
      faltante: 150,
    });
  });

  it("una cuota que se completa exacto no queda marcada como parcial", () => {
    const contratas = [
      contrata("unica", 300, [pago(1, { diasDesdeHoy: 0, montoAbonado: 100 })]),
    ];
    const r = distribuirAbono(contratas, 200, HOY);

    expect(r.aplicaciones[0].quedaPagada).toBe(true);
    expect(r.aplicaciones[0].faltante).toBe(0);
    expect(r.contratas[0].cuotas[0].parcial).toBeUndefined();
  });
});

describe("distribuirAbono — etapa 2 (atrasadas, drenando completo por contrata)", () => {
  it("no toca atrasadas si la semana de alguna contrata no quedó cubierta", () => {
    const r = distribuirAbono(escenarioBase(), 650, HOY);
    const deC = r.aplicaciones.filter((a) => a.contrataId === "c-ocho-pagos");
    expect(deC).toHaveLength(0);
  });

  it("cubierta toda la semana, el sobrante drena completo en la atrasada más vieja de la contrata prioritaria con atrasadas", () => {
    // Semana completa (900) + 200 (cuota 5 de C, completa) + 100 (parcial de cuota 6 de C).
    const r = distribuirAbono(escenarioBase(), 900 + 200 + 100, HOY);
    expect(r.sobranteNoAplicado).toBe(0);

    const deC = r.aplicaciones.filter((a) => a.contrataId === "c-ocho-pagos");
    const cuota5 = deC.find((a) => a.numeroCuota === 5)!;
    expect(cuota5.montoAplicado).toBe(200);
    expect(cuota5.quedaPagada).toBe(true);

    const cuota6 = deC.find((a) => a.numeroCuota === 6)!;
    expect(cuota6.montoAplicado).toBe(100);
    expect(cuota6.quedaPagada).toBe(false);
  });
});

describe("distribuirAbono — etapa 3 (adelanto a futuras)", () => {
  it("solo adelanta futuras si ya no queda NADA pendiente (semana + atrasadas)", () => {
    // Exactamente lo necesario para semana (900) + atrasadas de C (400) = 1300, sin sobra.
    const r = distribuirAbono(escenarioBase(), 1300, HOY);
    expect(r.sobranteNoAplicado).toBe(0);
    expect(r.aplicaciones.some((a) => a.numeroCuota === 9 || a.numeroCuota === 10)).toBe(false);
  });

  it("con más de todo lo vigente, adelanta la futura más próxima de la contrata prioritaria con futuras", () => {
    // 1300 (todo lo vigente) + 400 (cuota 9 de B, completa).
    const r = distribuirAbono(escenarioBase(), 1300 + 400, HOY);
    expect(r.sobranteNoAplicado).toBe(0);
    const cuota9 = r.aplicaciones.find((a) => a.numeroCuota === 9)!;
    expect(cuota9.montoAplicado).toBe(400);
    expect(cuota9.quedaPagada).toBe(true);
    // La 10 (siguiente futura de la misma contrata) todavía no se toca.
    expect(r.aplicaciones.some((a) => a.numeroCuota === 10)).toBe(false);
  });
});

describe("distribuirAbono — sobrante", () => {
  it("si el monto supera TODO lo que las contratas deben (incluidas futuras), no se inventa dónde ponerlo", () => {
    // Total absoluto de todo lo pendiente en el escenario: 900 + 400 + 800 + 200 = 2300.
    const r = distribuirAbono(escenarioBase(), 2300 + 150, HOY);
    expect(r.sobranteNoAplicado).toBe(150);
    expect(r.totalAplicado).toBe(2300);
  });

  it("con monto 0, no aplica nada y no revienta", () => {
    const r = distribuirAbono(escenarioBase(), 0, HOY);
    expect(r.aplicaciones).toHaveLength(0);
    expect(r.sobranteNoAplicado).toBe(0);
    expect(r.totalAplicado).toBe(0);
  });
});

describe("distribuirAbono — prioridad y empates", () => {
  it("prioriza la contrata con menos cuotas restantes", () => {
    // "pocas-restantes" tiene 1 pendiente, "muchas-restantes" tiene 3 — con
    // monto para cubrir solo una semana, debe tocarle a la de 1 restante
    // aunque aparezca segunda en la lista.
    const contratas = [
      contrata("muchas-restantes", 200, [
        pago(8, { diasDesdeHoy: 0 }),
        pago(9, { diasDesdeHoy: 7 }),
        pago(10, { diasDesdeHoy: 14 }),
      ]),
      contrata("pocas-restantes", 200, [pago(7, { diasDesdeHoy: 0 })]),
    ];
    const r = distribuirAbono(contratas, 200, HOY);
    expect(r.aplicaciones).toHaveLength(1);
    expect(r.aplicaciones[0].contrataId).toBe("pocas-restantes");
  });

  it("con empate en cuotas restantes, desempata por contrataId ascendente", () => {
    const empatadas = [
      contrata("zzz", 100, [pago(1, { diasDesdeHoy: 0 })]),
      contrata("aaa", 100, [pago(1, { diasDesdeHoy: 0 })]),
    ];
    const r = distribuirAbono(empatadas, 100, HOY);
    expect(r.aplicaciones).toHaveLength(1);
    expect(r.aplicaciones[0].contrataId).toBe("aaa");
  });
});

describe("distribuirAbono — casos de borde", () => {
  it("una contrata sin nada pendiente no aparece y no afecta a las demás", () => {
    const liquidada = contrata("liquidada", 100, [
      pago(1, { diasDesdeHoy: -30, pagado: true }),
      pago(2, { diasDesdeHoy: -23, pagado: true }),
    ]);
    const conPendiente = contrata("con-pendiente", 200, [pago(1, { diasDesdeHoy: 0 })]);
    const r = distribuirAbono([liquidada, conPendiente], 200, HOY);
    expect(r.aplicaciones).toHaveLength(1);
    expect(r.aplicaciones[0].contrataId).toBe("con-pendiente");
    expect(r.contratas.some((c) => c.contrataId === "liquidada")).toBe(false);
  });

  it("respeta un abono parcial ya registrado en la cuota", () => {
    const c = contrata("con-abono-previo", 200, [
      pago(1, { diasDesdeHoy: 0, montoAbonado: 150 }),
    ]);
    const r = distribuirAbono([c], 50, HOY);
    expect(r.aplicaciones).toHaveLength(1);
    expect(r.aplicaciones[0].montoAplicado).toBe(50);
    expect(r.aplicaciones[0].quedaPagada).toBe(true);
    expect(r.sobranteNoAplicado).toBe(0);
  });

  it("un monto negativo no aplica nada (se trata como cero)", () => {
    const r = distribuirAbono(escenarioBase(), -100, HOY);
    expect(r.aplicaciones).toHaveLength(0);
    expect(r.sobranteNoAplicado).toBe(0);
  });
});
