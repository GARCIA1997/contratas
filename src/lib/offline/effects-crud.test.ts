import { beforeEach, describe, expect, it } from "vitest";
import { db as maybeDb } from "@/lib/offline/db";
import { applyLocalEffect } from "@/lib/offline/effects";

if (!maybeDb) throw new Error("db no inicializada — ¿falta jsdom/fake-indexeddb?");
const db = maybeDb;

const OWNER = "owner-1";

/**
 * Alta/edición/baja de clientes y deudores sin señal. Antes de esto se podía
 * crear una contrata offline pero no un cliente suelto, que es justo lo que
 * se hace en campo al conseguir a alguien nuevo en la puerta de su casa.
 */
describe("efectos locales de cliente", () => {
  beforeEach(async () => {
    await db.clientes.clear();
  });

  it("crear inserta la fila de inmediato con el id que ya trae", async () => {
    // El id se genera en el cliente y viaja en el payload: así el registro
    // nace con su id definitivo y una contrata creada offline puede
    // referenciarlo sin remapeos al sincronizar.
    await applyLocalEffect("cliente.crear", {
      id: "cli-nuevo",
      ownerId: OWNER,
      nombre: "María",
      telefono: "3121234567",
      direccion: null,
      referencia: null,
      notas: null,
    });

    const guardado = await db.clientes.get("cli-nuevo");
    expect(guardado?.nombre).toBe("María");
    expect(guardado?.ownerId).toBe(OWNER);
    // `_dirty` evita que el pull-sync lo pise antes de confirmarse.
    expect(guardado?._dirty).toBe(true);
  });

  it("editar cambia solo los campos enviados", async () => {
    await db.clientes.add({
      id: "cli-1",
      ownerId: OWNER,
      nombre: "Juan",
      telefono: "111",
      direccion: "Calle 1",
      referencia: null,
      notas: null,
      creadoEn: new Date().toISOString(),
    });

    await applyLocalEffect("cliente.editar", {
      clienteId: "cli-1",
      input: { telefono: "999" },
    });

    const c = await db.clientes.get("cli-1");
    expect(c?.telefono).toBe("999");
    expect(c?.nombre).toBe("Juan");
    expect(c?.direccion).toBe("Calle 1");
    expect(c?._dirty).toBe(true);
  });

  it("eliminar marca la baja pero conserva la fila hasta confirmarse", async () => {
    await db.clientes.add({
      id: "cli-1",
      ownerId: OWNER,
      nombre: "Juan",
      telefono: null,
      direccion: null,
      referencia: null,
      notas: null,
      creadoEn: new Date().toISOString(),
    });

    await applyLocalEffect("cliente.eliminar", { clienteId: "cli-1" });

    const c = await db.clientes.get("cli-1");
    // Borrarla de una vez dejaría que `syncClientes` la reviva desde el
    // servidor, donde todavía existe mientras la cola no se vacíe.
    expect(c).toBeDefined();
    expect(c?._deletedAt).toBeTruthy();
    expect(c?._dirty).toBe(true);
  });
});

describe("efectos locales de deudor", () => {
  beforeEach(async () => {
    await db.deudores.clear();
  });

  it("crear arranca con el saldo igual a la deuda inicial", async () => {
    await applyLocalEffect("deudor.crear", {
      id: "d-nuevo",
      ownerId: OWNER,
      nombre: "Pedro",
      deudaInicial: 5000,
      notas: null,
    });

    const d = await db.deudores.get("d-nuevo");
    expect(d?.saldoActual).toBe(5000);
    expect(d?.numAbonos).toBe(0);
    expect(d?._dirty).toBe(true);
  });

  it("editar la deuda inicial recalcula el saldo conservando lo abonado", async () => {
    await db.deudores.add({
      id: "d1",
      ownerId: OWNER,
      nombre: "Pedro",
      deudaInicial: 5000,
      notas: null,
      creadoEn: new Date().toISOString(),
      saldoActual: 3000, // ya abonó 2000
      numAbonos: 1,
    });

    await applyLocalEffect("deudor.editar", {
      deudorId: "d1",
      input: { deudaInicial: 6000 },
    });

    const d = await db.deudores.get("d1");
    // Lo abonado (2000) no cambia; lo que resta sí: 6000 - 2000.
    expect(d?.saldoActual).toBe(4000);
    expect(d?.deudaInicial).toBe(6000);
  });

  it("editar solo el nombre no toca el saldo", async () => {
    await db.deudores.add({
      id: "d1",
      ownerId: OWNER,
      nombre: "Pedro",
      deudaInicial: 5000,
      notas: null,
      creadoEn: new Date().toISOString(),
      saldoActual: 3000,
      numAbonos: 1,
    });

    await applyLocalEffect("deudor.editar", {
      deudorId: "d1",
      input: { nombre: "Pedro Ramírez" },
    });

    const d = await db.deudores.get("d1");
    expect(d?.nombre).toBe("Pedro Ramírez");
    expect(d?.saldoActual).toBe(3000);
  });
});
