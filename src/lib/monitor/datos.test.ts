import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({
  HttpError: class extends Error {},
  requireUser: vi.fn(),
}));

import { desdeDe, etiquetaOperacion, tipoDeOperacion } from "./datos";

describe("tipoDeOperacion", () => {
  it("normaliza ids y números para agrupar el mismo tipo de movimiento", () => {
    expect(tipoDeOperacion("contratas/cmrvdn2i100vyny01sojpbovv/pagos/14/abonar")).toBe(
      "contratas/:id/pagos/:n/abonar"
    );
    expect(tipoDeOperacion("citas/46bc1e44-8799-4098-9549-d4a4b446c163/entregar")).toBe(
      "citas/:id/entregar"
    );
    expect(tipoDeOperacion("contratas/crear")).toBe("contratas/crear");
  });

  it("traduce los tipos conocidos a algo legible", () => {
    expect(etiquetaOperacion("contratas/cmrvdn2i100vyny01sojpbovv/pagos/2/abonar")).toBe("Abono a cuota");
    expect(etiquetaOperacion("contratas/crear")).toBe("Contrata entregada");
    expect(etiquetaOperacion("algo/nuevo")).toBe("algo/nuevo");
  });
});

describe("desdeDe", () => {
  const ahora = new Date(2026, 9, 3, 15, 30);
  it("hoy empieza a medianoche", () => {
    expect(desdeDe("hoy", ahora)).toEqual(new Date(2026, 9, 3, 0, 0, 0, 0));
  });
  it("7 y 30 días cuentan hacia atrás desde ahora", () => {
    expect(desdeDe("7d", ahora)).toEqual(new Date(2026, 8, 26, 15, 30));
    expect(desdeDe("30d", ahora)).toEqual(new Date(2026, 8, 3, 15, 30));
  });
});
