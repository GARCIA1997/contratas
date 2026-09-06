import { describe, expect, it } from "vitest";
import {
  agruparCitasPorSemana,
  citasPendientesOrdenadas,
  estadoCitaVista,
  type CitaLike,
} from "./citas";

const HOY = new Date(2026, 6, 30);

function cita(overrides: Partial<CitaLike> = {}): CitaLike {
  return { estado: "PENDIENTE", fechaEntrega: HOY, ...overrides };
}

describe("estadoCitaVista", () => {
  it("una cita pendiente con fecha de hoy se muestra PENDIENTE", () => {
    expect(estadoCitaVista(cita({ fechaEntrega: HOY }), HOY)).toBe("PENDIENTE");
  });

  it("una cita pendiente con fecha futura se muestra PENDIENTE", () => {
    expect(
      estadoCitaVista(cita({ fechaEntrega: new Date(2026, 7, 1) }), HOY)
    ).toBe("PENDIENTE");
  });

  it("una cita pendiente con fecha pasada se muestra ATRASADA", () => {
    expect(
      estadoCitaVista(cita({ fechaEntrega: new Date(2026, 6, 29) }), HOY)
    ).toBe("ATRASADA");
  });

  it("una cita entregada nunca se muestra ATRASADA aunque su fecha haya pasado", () => {
    expect(
      estadoCitaVista(
        cita({ estado: "ENTREGADA", fechaEntrega: new Date(2026, 6, 1) }),
        HOY
      )
    ).toBe("ENTREGADA");
  });

  it("una cita cancelada se muestra CANCELADA", () => {
    expect(
      estadoCitaVista(
        cita({ estado: "CANCELADA", fechaEntrega: new Date(2026, 6, 1) }),
        HOY
      )
    ).toBe("CANCELADA");
  });

  it("respeta fechas dadas como string ISO (fecha de <input type=date>)", () => {
    expect(estadoCitaVista(cita({ fechaEntrega: "2026-07-30" }), HOY)).toBe(
      "PENDIENTE"
    );
    expect(estadoCitaVista(cita({ fechaEntrega: "2026-07-29" }), HOY)).toBe(
      "ATRASADA"
    );
  });
});

describe("citasPendientesOrdenadas", () => {
  it("incluye pasadas, hoy y futuras, ordenadas ascendente", () => {
    const citas = [
      cita({ fechaEntrega: new Date(2026, 7, 5) }),
      cita({ fechaEntrega: new Date(2026, 6, 20) }),
      cita({ fechaEntrega: HOY }),
    ];
    const resultado = citasPendientesOrdenadas(citas);
    expect(resultado.map((c) => c.fechaEntrega)).toEqual([
      new Date(2026, 6, 20),
      HOY,
      new Date(2026, 7, 5),
    ]);
  });

  it("excluye entregadas y canceladas", () => {
    const citas = [
      cita({ estado: "ENTREGADA" }),
      cita({ estado: "CANCELADA" }),
      cita({ estado: "PENDIENTE" }),
    ];
    expect(citasPendientesOrdenadas(citas)).toHaveLength(1);
  });
});

describe("agruparCitasPorSemana", () => {
  const cita = (
    fechaEntrega: string,
    montoEstimado: number,
    periodicidad?: "SEMANAL" | "QUINCENAL" | "MENSUAL" | null,
    estado: "PENDIENTE" | "ENTREGADA" | "CANCELADA" = "PENDIENTE"
  ) => ({ fechaEntrega, montoEstimado, periodicidad, estado });

  it("parte las citas en semanas de lunes a domingo", () => {
    // 7 sep 2026 es lunes; el 13 es domingo de esa misma semana.
    const semanas = agruparCitasPorSemana([
      cita("2026-09-07T00:00:00.000Z", 1000),
      cita("2026-09-13T00:00:00.000Z", 500),
      cita("2026-09-14T00:00:00.000Z", 300),
    ]);
    expect(semanas).toHaveLength(2);
    expect(semanas[0].citas).toHaveLength(2);
    expect(semanas[1].citas).toHaveLength(1);
  });

  it("suma el total de cada semana", () => {
    const semanas = agruparCitasPorSemana([
      cita("2026-09-07T00:00:00.000Z", 1000),
      cita("2026-09-09T00:00:00.000Z", 2500.5),
      cita("2026-09-14T00:00:00.000Z", 300),
    ]);
    expect(semanas[0].total).toBe(3500.5);
    expect(semanas[1].total).toBe(300);
  });

  it("titula la semana con el rango de fechas, sin repetir el mes", () => {
    const semanas = agruparCitasPorSemana([cita("2026-09-09T00:00:00.000Z", 100)]);
    expect(semanas[0].titulo).toBe("7 – 13 sep");
  });

  it("pone el mes en ambos extremos cuando la semana cruza de mes", () => {
    // Semana del 28 sep (lunes) al 4 oct (domingo).
    const semanas = agruparCitasPorSemana([cita("2026-09-30T00:00:00.000Z", 100)]);
    expect(semanas[0].titulo).toBe("28 sep – 4 oct");
  });

  it("devuelve las semanas en orden cronológico aunque lleguen desordenadas", () => {
    const semanas = agruparCitasPorSemana([
      cita("2026-09-21T00:00:00.000Z", 100),
      cita("2026-09-07T00:00:00.000Z", 100),
      cita("2026-09-14T00:00:00.000Z", 100),
    ]);
    expect(semanas.map((s) => s.clave)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
  });

  it("deja las atrasadas en la semana que les tocaba, no en una sección aparte", () => {
    const semanas = agruparCitasPorSemana([
      cita("2026-08-31T00:00:00.000Z", 100), // semana anterior
      cita("2026-09-07T00:00:00.000Z", 100),
    ]);
    expect(semanas).toHaveLength(2);
    expect(semanas[0].clave).toBe("2026-08-31");
  });

  it("ignora las citas que ya no están pendientes", () => {
    const semanas = agruparCitasPorSemana([
      cita("2026-09-07T00:00:00.000Z", 100),
      cita("2026-09-08T00:00:00.000Z", 999, null, "ENTREGADA"),
      cita("2026-09-09T00:00:00.000Z", 999, null, "CANCELADA"),
    ]);
    expect(semanas).toHaveLength(1);
    expect(semanas[0].total).toBe(100);
  });

  it("filtra por periodicidad", () => {
    const citas = [
      cita("2026-09-07T00:00:00.000Z", 100, "SEMANAL"),
      cita("2026-09-08T00:00:00.000Z", 200, "QUINCENAL"),
      cita("2026-09-09T00:00:00.000Z", 300, "MENSUAL"),
    ];
    expect(agruparCitasPorSemana(citas, "TODAS")[0].total).toBe(600);
    expect(agruparCitasPorSemana(citas, "SEMANAL")[0].total).toBe(100);
    expect(agruparCitasPorSemana(citas, "QUINCENAL")[0].total).toBe(200);
    expect(agruparCitasPorSemana(citas, "MENSUAL")[0].total).toBe(300);
  });

  it("agrupa bajo SIN_DEFINIR las citas agendadas sin periodicidad", () => {
    const citas = [
      cita("2026-09-07T00:00:00.000Z", 100, "SEMANAL"),
      cita("2026-09-08T00:00:00.000Z", 200, null),
      cita("2026-09-09T00:00:00.000Z", 300, undefined),
    ];
    const sinDefinir = agruparCitasPorSemana(citas, "SIN_DEFINIR");
    expect(sinDefinir[0].total).toBe(500);
  });

  it("no devuelve secciones cuando el filtro no deja nada", () => {
    const semanas = agruparCitasPorSemana(
      [cita("2026-09-07T00:00:00.000Z", 100, "SEMANAL")],
      "MENSUAL"
    );
    expect(semanas).toEqual([]);
  });
});
