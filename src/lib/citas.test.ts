import { describe, expect, it } from "vitest";
import {
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
