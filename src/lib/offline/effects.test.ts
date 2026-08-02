import { beforeEach, describe, expect, it } from "vitest";
import { db as maybeDb, type ContrataLocal, type PagoLocal } from "@/lib/offline/db";
import { applyLocalEffect } from "@/lib/offline/effects";

if (!maybeDb) throw new Error("db no inicializada — ¿falta jsdom/fake-indexeddb?");
const db = maybeDb;

const OWNER = "owner-1";

async function seedContrata(overrides: Partial<ContrataLocal> = {}) {
  await db.contratas.add({
    id: "c1",
    ownerId: OWNER,
    clienteId: "cli-1",
    clienteNombre: "Juan",
    clienteTelefono: null,
    tipo: "SEMANAL",
    monto: 5000,
    abono: 600,
    fechaInicio: new Date(2026, 6, 1).toISOString(),
    numCuotas: 10,
    mes: "2026-07",
    notas: null,
    convertidaADeuda: false,
    deudorId: null,
    creadoEn: new Date().toISOString(),
    ...overrides,
  });
}

async function seedPago(overrides: Partial<PagoLocal> = {}) {
  await db.pagos.add({
    id: "p1",
    contrataId: "c1",
    ownerId: OWNER,
    numeroCuota: 1,
    fechaProgramada: new Date(2026, 6, 8).toISOString(),
    fechaPago: null,
    pagado: false,
    montoAbonado: 0,
    ...overrides,
  });
}

beforeEach(async () => {
  await Promise.all([
    db.contratas.clear(),
    db.pagos.clear(),
    db.deudores.clear(),
    db.abonosDeudor.clear(),
  ]);
});

describe("applyLocalEffect", () => {
  it("contrata.pago.toggle marca pagado y setea montoAbonado = abono", async () => {
    await seedContrata();
    await seedPago();
    await applyLocalEffect("contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    const pago = await db.pagos.get("p1");
    expect(pago?.pagado).toBe(true);
    expect(pago?.montoAbonado).toBe(600);
    expect(pago?.fechaPago).not.toBeNull();
    const contrata = await db.contratas.get("c1");
    expect(contrata?._dirty).toBe(true);
  });

  it("contrata.pago.toggle revierte si se llama dos veces", async () => {
    await seedContrata();
    await seedPago();
    await applyLocalEffect("contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    await applyLocalEffect("contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    const pago = await db.pagos.get("p1");
    expect(pago?.pagado).toBe(false);
    expect(pago?.montoAbonado).toBe(0);
    expect(pago?.fechaPago).toBeNull();
  });

  it("contrata.pago.abonar acumula el monto y marca pagado al alcanzar el abono", async () => {
    await seedContrata();
    await seedPago();
    await applyLocalEffect("contrata.pago.abonar", { contrataId: "c1", numeroCuota: 1, monto: 400 });
    let pago = await db.pagos.get("p1");
    expect(pago?.montoAbonado).toBe(400);
    expect(pago?.pagado).toBe(false);

    await applyLocalEffect("contrata.pago.abonar", { contrataId: "c1", numeroCuota: 1, monto: 200 });
    pago = await db.pagos.get("p1");
    expect(pago?.montoAbonado).toBe(600);
    expect(pago?.pagado).toBe(true);
  });

  it("contrata.pago.revertir resetea el pago a 0/no pagado", async () => {
    await seedContrata();
    await seedPago({ pagado: true, montoAbonado: 600, fechaPago: new Date().toISOString() });
    await applyLocalEffect("contrata.pago.revertir", { contrataId: "c1", numeroCuota: 1 });
    const pago = await db.pagos.get("p1");
    expect(pago?.pagado).toBe(false);
    expect(pago?.montoAbonado).toBe(0);
    expect(pago?.fechaPago).toBeNull();
  });

  it("contrata.marcarDeuda marca convertidaADeuda sin tocar Deudor localmente", async () => {
    await seedContrata();
    await applyLocalEffect("contrata.marcarDeuda", { contrataId: "c1" });
    const contrata = await db.contratas.get("c1");
    expect(contrata?.convertidaADeuda).toBe(true);
    expect(contrata?._dirty).toBe(true);
  });

  it("contrata.editar solo actualiza los campos simples enviados", async () => {
    await seedContrata();
    await applyLocalEffect("contrata.editar", {
      contrataId: "c1",
      input: { monto: 8000, notas: "actualizado offline" },
    });
    const contrata = await db.contratas.get("c1");
    expect(contrata?.monto).toBe(8000);
    expect(contrata?.notas).toBe("actualizado offline");
    expect(contrata?.abono).toBe(600); // sin cambios
    expect(contrata?._dirty).toBe(true);
  });

  it("contrata.renovar marca dirty la contrata y las 'otras' sin crear la nueva localmente", async () => {
    await seedContrata();
    await seedContrata({ id: "c2" });
    await applyLocalEffect("contrata.renovar", { contrataId: "c1", otrasIds: ["c2"] });
    expect((await db.contratas.get("c1"))?._dirty).toBe(true);
    expect((await db.contratas.get("c2"))?._dirty).toBe(true);
    expect(await db.contratas.count()).toBe(2); // no se agregó una tercera
  });

  it("cliente.unificar marca dirty todas las contratas seleccionadas", async () => {
    await seedContrata({ id: "c1" });
    await seedContrata({ id: "c2" });
    await applyLocalEffect("cliente.unificar", { contrataIds: ["c1", "c2"] });
    expect((await db.contratas.get("c1"))?._dirty).toBe(true);
    expect((await db.contratas.get("c2"))?._dirty).toBe(true);
  });

  it("contrata.eliminar marca _deletedAt", async () => {
    await seedContrata();
    await applyLocalEffect("contrata.eliminar", { contrataId: "c1" });
    const contrata = await db.contratas.get("c1");
    expect(contrata?._deletedAt).not.toBeNull();
    expect(contrata?._dirty).toBe(true);
  });

  it("deudor.abonar descuenta del saldoActual y agrega el abono", async () => {
    await db.deudores.add({
      id: "d1",
      ownerId: OWNER,
      nombre: "Pedro",
      deudaInicial: 1000,
      notas: null,
      creadoEn: new Date().toISOString(),
      saldoActual: 1000,
      numAbonos: 0,
    });
    await applyLocalEffect("deudor.abonar", {
      deudorId: "d1",
      abonoLocalId: "a1",
      fecha: new Date().toISOString(),
      monto: 300,
      notas: null,
    });
    const deudor = await db.deudores.get("d1");
    expect(deudor?.saldoActual).toBe(700);
    expect(deudor?.numAbonos).toBe(1);
    expect(deudor?._dirty).toBe(true);
    const abono = await db.abonosDeudor.get("a1");
    expect(abono?.restante).toBe(700);
  });

  it("cliente.cobrarVencidas paga todas las cuotas vencidas o vigentes de las contratas activas del cliente", async () => {
    await seedContrata({ id: "c1", clienteId: "cli-1", abono: 600 });
    await seedPago({ id: "p1", contrataId: "c1", numeroCuota: 1, fechaProgramada: new Date(2020, 0, 1).toISOString() });
    await seedPago({ id: "p2", contrataId: "c1", numeroCuota: 2, fechaProgramada: new Date(2099, 0, 1).toISOString() });
    await applyLocalEffect("cliente.cobrarVencidas", { clienteId: "cli-1" });
    expect((await db.pagos.get("p1"))?.pagado).toBe(true);
    expect((await db.pagos.get("p2"))?.pagado).toBe(false); // futura, no se toca
    expect((await db.contratas.get("c1"))?._dirty).toBe(true);
  });

  it("cliente.cobrarVencidas también paga cuotas 'próximas' (dentro de DIAS_PROXIMO_VENCIMIENTO) — el efecto optimista debe cubrir lo mismo que el total mostrado en el preview", async () => {
    const enDosDias = new Date();
    enDosDias.setDate(enDosDias.getDate() + 2);
    const enDiez = new Date();
    enDiez.setDate(enDiez.getDate() + 10);
    await seedContrata({ id: "c1", clienteId: "cli-1", abono: 600 });
    await seedPago({ id: "p1", contrataId: "c1", numeroCuota: 1, fechaProgramada: enDosDias.toISOString() });
    await seedPago({ id: "p2", contrataId: "c1", numeroCuota: 2, fechaProgramada: enDiez.toISOString() });
    await applyLocalEffect("cliente.cobrarVencidas", { clienteId: "cli-1" });
    expect((await db.pagos.get("p1"))?.pagado).toBe(true); // próxima, dentro de la ventana
    expect((await db.pagos.get("p2"))?.pagado).toBe(false); // demasiado lejos todavía
  });
});
