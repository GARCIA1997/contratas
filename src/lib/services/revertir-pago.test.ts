import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Revertir una cuota borra todo lo abonado (no hay historial por abono).
 * En una contrata ya pasada a Deudores no se permite: su saldo ya vive en
 * el deudor y reabrir la cuota lo contaría dos veces.
 */
const { fake, revertirRecibos } = vi.hoisted(() => ({
  fake: {
    contrata: { findFirst: vi.fn() },
    pago: { update: vi.fn(async () => ({})) },
  },
  revertirRecibos: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({ prisma: fake }));
vi.mock("@/lib/whatsapp-auto/recibos", async (original) => ({
  ...(await original<typeof import("@/lib/whatsapp-auto/recibos")>()),
  revertirRecibos,
}));

import { limpiarPago } from "./contratas";

function contrata(convertidaADeuda: boolean) {
  return {
    id: "k1",
    convertidaADeuda,
    pagos: [{ id: "p1", numeroCuota: 1, montoAbonado: 124.68, pagado: true, fechaPago: new Date() }],
  };
}

describe("limpiarPago", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deja la cuota pendiente y sin abonos, y retira su recibo", async () => {
    fake.contrata.findFirst.mockResolvedValue(contrata(false));
    await limpiarPago("o1", "k1", 1);
    expect(fake.pago.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { montoAbonado: 0, pagado: false, fechaPago: null },
    });
    expect(revertirRecibos).toHaveBeenCalledWith("o1", ["p1"]);
  });

  it("no toca nada si la contrata ya se pasó a Deudores", async () => {
    fake.contrata.findFirst.mockResolvedValue(contrata(true));
    await expect(limpiarPago("o1", "k1", 1)).rejects.toMatchObject({ status: 409 });
    expect(fake.pago.update).not.toHaveBeenCalled();
    expect(revertirRecibos).not.toHaveBeenCalled();
  });
});
