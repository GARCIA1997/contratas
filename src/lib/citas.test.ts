import { describe, expect, it } from "vitest";
import { citasDelDia, estadoCitaVista, type CitaLike } from "./citas";

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

describe("citasDelDia", () => {
  it("incluye pendientes de hoy y atrasadas, excluye futuras", () => {
    const citas = [
      cita({ fechaEntrega: HOY }),
      cita({ fechaEntrega: new Date(2026, 6, 25) }),
      cita({ fechaEntrega: new Date(2026, 7, 5) }),
    ];
    const resultado = citasDelDia(citas, HOY);
    expect(resultado).toHaveLength(2);
  });

  it("excluye entregadas y canceladas aunque su fecha ya haya llegado", () => {
    const citas = [
      cita({ fechaEntrega: HOY, estado: "ENTREGADA" }),
      cita({ fechaEntrega: HOY, estado: "CANCELADA" }),
    ];
    expect(citasDelDia(citas, HOY)).toHaveLength(0);
  });

  it("ordena por fecha ascendente, la más atrasada primero", () => {
    const citas = [
      cita({ fechaEntrega: new Date(2026, 6, 28) }),
      cita({ fechaEntrega: new Date(2026, 6, 20) }),
      cita({ fechaEntrega: HOY }),
    ];
    const resultado = citasDelDia(citas, HOY);
    expect(resultado.map((c) => c.fechaEntrega)).toEqual([
      new Date(2026, 6, 20),
      new Date(2026, 6, 28),
      HOY,
    ]);
  });
});
