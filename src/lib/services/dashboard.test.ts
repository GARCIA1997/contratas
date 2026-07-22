import { describe, expect, it } from "vitest";
import { aggregateKpis, type ContrataParaKpis } from "./dashboard";

function base(overrides: Partial<ContrataParaKpis> = {}): ContrataParaKpis {
  return {
    tipo: "SEMANAL",
    monto: 1000,
    abono: 1200,
    numCuotas: 10,
    fechaInicio: new Date(2026, 0, 1),
    convertidaADeuda: false,
    pagos: [],
    ...overrides,
  };
}

describe("aggregateKpis — convertidaADeuda", () => {
  it("cuenta el cobrado/ganancia histórico de una contrata ya convertida a deuda", () => {
    const hoy = new Date(2026, 6, 21); // martes
    const convertida = base({
      convertidaADeuda: true,
      pagos: [
        {
          pagado: true,
          montoAbonado: 500,
          fechaProgramada: new Date(2026, 6, 15),
          fechaPago: new Date(2026, 6, 15),
        },
      ],
    });
    const kpis = aggregateKpis([convertida], [], hoy);
    expect(kpis.cobrado.total).toBe(500);
    expect(kpis.ganancia.total).toBeGreaterThan(0);
  });

  it("excluye a la contrata convertida a deuda de capital activo, proyectado y flujo de caja", () => {
    const hoy = new Date(2026, 6, 21); // martes de la semana 20-26 jul
    const convertida = base({
      convertidaADeuda: true,
      monto: 5000,
      abono: 600,
      pagos: [
        {
          pagado: false,
          montoAbonado: 0,
          fechaProgramada: new Date(2026, 6, 22),
          fechaPago: null,
        },
      ],
    });
    const kpis = aggregateKpis([convertida], [], hoy);
    expect(kpis.capitalActivo).toBe(0);
    expect(kpis.contratasActivas).toBe(0);
    expect(kpis.saldoPendiente).toBe(0);
    expect(kpis.proyectado.semana).toBe(0);
    expect(kpis.flujoProyectado.every((b) => b.monto === 0)).toBe(true);
  });

  it("una contrata activa normal sigue proyectando y contando capital como antes", () => {
    const hoy = new Date(2026, 6, 21);
    const activa = base({
      monto: 5000,
      abono: 600,
      pagos: [
        {
          pagado: false,
          montoAbonado: 0,
          fechaProgramada: new Date(2026, 6, 22),
          fechaPago: null,
        },
      ],
    });
    const kpis = aggregateKpis([activa], [], hoy);
    expect(kpis.capitalActivo).toBe(5000);
    expect(kpis.contratasActivas).toBe(1);
    expect(kpis.proyectado.semana).toBe(600);
  });
});

describe("aggregateKpis — flujo de caja usa la misma semana calendario que proyectado", () => {
  it("el primer balde de flujoProyectado coincide con la semana de proyectado.semana", () => {
    const hoy = new Date(2026, 6, 22); // miércoles
    const c = base({
      abono: 600,
      pagos: [
        {
          // Domingo de esta misma semana calendario (26 jul) — no cae en
          // la ventana móvil "hoy+6" antigua, pero sí en lunes-domingo.
          pagado: false,
          montoAbonado: 0,
          fechaProgramada: new Date(2026, 6, 26),
          fechaPago: null,
        },
      ],
    });
    const kpis = aggregateKpis([c], [], hoy);
    expect(kpis.proyectado.semana).toBe(600);
    expect(kpis.flujoProyectado[0].monto).toBe(600);
  });

  it("una cuota del lunes de la semana ya pasada esta semana (antes de hoy) sigue en el balde 0", () => {
    const hoy = new Date(2026, 6, 22); // miércoles
    const c = base({
      abono: 600,
      pagos: [
        {
          // Lunes de esta semana (20 jul) — ya pasó respecto a "hoy", pero
          // sigue siendo la semana calendario en curso.
          pagado: false,
          montoAbonado: 0,
          fechaProgramada: new Date(2026, 6, 20),
          fechaPago: null,
        },
      ],
    });
    const kpis = aggregateKpis([c], [], hoy);
    expect(kpis.flujoProyectado[0].monto).toBe(600);
  });
});
