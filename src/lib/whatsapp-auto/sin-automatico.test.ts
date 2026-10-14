import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quien NO tiene el WhatsApp automático (sin cuenta, apagado o con los
 * recibos apagados) debe cobrar y entregar exactamente igual que antes:
 * ninguna escritura extra, ningún mensaje encolado, nada que pueda fallar.
 */
const { fake } = vi.hoisted(() => {
  const fake = {
    cuentaWhatsApp: { findUnique: vi.fn() },
    optOutWhatsApp: { findUnique: vi.fn() },
    configuracion: { findUnique: vi.fn(async () => ({ nombreApp: "Kredired" })) },
    mensajeWhatsApp: { createMany: vi.fn(), updateMany: vi.fn() },
    errorLog: { create: vi.fn(async () => ({})) },
    bitacoraWhatsApp: { create: vi.fn(async () => ({})) },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { fake };
});
vi.mock("@/lib/prisma", () => ({ prisma: fake }));

import {
  encolarRecibosAparte,
  guardarCobro,
  prepararComprobanteEntrega,
  prepararReciboCobro,
} from "./recibos";

const cliente = { id: "c1", nombre: "Leticia", telefono: "3121234567" };
const cobro = () =>
  prepararReciboCobro({
    ownerId: "o1",
    cliente,
    pagoIds: ["p1"],
    armar: () => ({ total: 100, contratas: [{ numCuotas: 10, cuotas: [{ numeroCuota: 1, monto: 100 }], subtotal: 100 }] }),
  });
const entrega = () => prepararComprobanteEntrega({ ownerId: "o1", cliente, contrataId: "k1", texto: () => "x" });

describe("sin WhatsApp automático todo queda como antes", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [caso, cuenta] of [
    ["sin cuenta", null],
    ["automático apagado", { id: "w1", ownerId: "o1", activo: false, recibos: true }],
    ["recibos apagados", { id: "w1", ownerId: "o1", activo: true, recibos: false }],
  ] as const) {
    it(`${caso}: no se prepara recibo ni comprobante y no se escribe nada de WhatsApp`, async () => {
      fake.cuentaWhatsApp.findUnique.mockResolvedValue(cuenta);
      expect(await cobro()).toBeNull();
      expect(await entrega()).toBeNull();
      await encolarRecibosAparte([await entrega(), await cobro()]);
      expect(fake.mensajeWhatsApp.createMany).not.toHaveBeenCalled();
      expect(fake.$executeRaw).not.toHaveBeenCalled();
      expect(fake.errorLog.create).not.toHaveBeenCalled();
    });
  }

  it("cliente sin teléfono: ni siquiera consulta la cuenta", async () => {
    const r = await prepararReciboCobro({
      ownerId: "o1",
      cliente: { ...cliente, telefono: null },
      pagoIds: ["p1"],
      armar: () => ({ total: 1, contratas: [] }),
    });
    expect(r).toBeNull();
    expect(fake.cuentaWhatsApp.findUnique).not.toHaveBeenCalled();
  });

  it("guardarCobro sin recibo escribe solo el cobro, sin transacción extra ni aviso al worker", async () => {
    const escritura = Promise.resolve("ok") as never;
    await guardarCobro(() => [escritura], null);
    expect(fake.$transaction).not.toHaveBeenCalled();
    expect(fake.$executeRaw).not.toHaveBeenCalled();
    expect(fake.mensajeWhatsApp.createMany).not.toHaveBeenCalled();
  });
});
