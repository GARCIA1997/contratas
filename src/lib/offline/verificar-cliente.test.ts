import { beforeEach, describe, expect, it, vi } from "vitest";
import { db as maybeDb } from "@/lib/offline/db";
import { setModoLocal } from "@/lib/offline/modo-local";
import { telefonoClave, verificarClienteNuevo } from "./verificar-cliente";

if (!maybeDb) throw new Error("db no inicializada");
const db = maybeDb;
const OWNER = "owner-1";

beforeEach(async () => {
  setModoLocal(false);
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  await Promise.all([db.clientes.clear(), db.writeQueue.clear()]);
  await db.clientes.add({
    id: "cli-ana",
    ownerId: OWNER,
    nombre: "Ana Pérez",
    telefono: "+52 313 191 1315",
    direccion: null,
    referencia: null,
    notas: null,
    creadoEn: new Date().toISOString(),
  });
});

describe("telefonoClave", () => {
  it("compara por los últimos 10 dígitos, sin importar formato ni lada", () => {
    expect(telefonoClave("+52 313 191 1315")).toBe("3131911315");
    expect(telefonoClave("313-191-1315")).toBe("3131911315");
    expect(telefonoClave("1315")).toBeNull();
  });
});

describe("verificarClienteNuevo", () => {
  it("nombre y teléfono iguales (escritos distinto): ya te pertenece", async () => {
    const v = await verificarClienteNuevo(OWNER, { nombre: "ana perez", telefono: "313-191-1315" });
    expect(v).toMatchObject({ tipo: "propio", cliente: { id: "cli-ana" }, enCola: false });
  });

  it("mismo teléfono con OTRO nombre: avisa de quién es el número (no lo da por el mismo cliente)", async () => {
    const v = await verificarClienteNuevo(OWNER, { nombre: "Rosa Pérez", telefono: "3131911315" });
    expect(v).toEqual({ tipo: "telefono", duenoDelNumero: "Ana Pérez", administrador: null });
  });

  it("mismo nombre con otro teléfono: es otra persona, se registra", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ propio: null, telefonoPropio: null, otros: [] }))));
    const v = await verificarClienteNuevo(OWNER, { nombre: "Ana Pérez", telefono: "3120000000" });
    expect(v).toEqual({ tipo: "nuevo" });
  });

  it("sin teléfono (alta desde una contrata) compara solo el nombre", async () => {
    const v = await verificarClienteNuevo(OWNER, { nombre: "ANA PÉREZ" });
    expect(v).toMatchObject({ tipo: "propio", cliente: { id: "cli-ana" } });
  });

  it("avisa si su alta sigue en la cola (pendiente de subir)", async () => {
    await db.writeQueue.add({
      id: "op-1",
      ownerId: OWNER,
      type: "cliente.crear",
      payload: { id: "cli-ana", ownerId: OWNER, nombre: "Ana Pérez" },
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    });
    const v = await verificarClienteNuevo(OWNER, { nombre: "Ana Pérez", telefono: "3131911315" });
    expect(v).toMatchObject({ tipo: "propio", enCola: true });
  });

  const servidor = (cuerpo: object) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: 200 })));

  it("mismo nombre y teléfono con otro administrador: con quién tiene contratas", async () => {
    servidor({
      propio: null,
      telefonoPropio: null,
      otros: [{ administrador: "Milton", nombre: "Juan López", mismoNombre: true, contratasActivas: 2, saldo: 5400 }],
    });
    const v = await verificarClienteNuevo(OWNER, { nombre: "Juan López", telefono: "3121234567" });
    expect(v).toMatchObject({ tipo: "otros", otros: [{ administrador: "Milton", contratasActivas: 2 }] });
  });

  it("solo el teléfono coincide con un cliente de otro administrador", async () => {
    servidor({
      propio: null,
      telefonoPropio: null,
      otros: [{ administrador: "Milton", nombre: "Juan López", mismoNombre: false, contratasActivas: 1, saldo: 900 }],
    });
    const v = await verificarClienteNuevo(OWNER, { nombre: "Pedro López", telefono: "3121234567" });
    expect(v).toEqual({ tipo: "telefono", duenoDelNumero: "Juan López", administrador: "Milton" });
  });

  it("propio solo en el servidor (el teléfono aún no lo baja)", async () => {
    servidor({ propio: { id: "srv-1", nombre: "Luis", telefono: "3120000000" }, telefonoPropio: null, otros: [] });
    const v = await verificarClienteNuevo(OWNER, { nombre: "Luis", telefono: "3120000000" });
    expect(v).toMatchObject({ tipo: "propio", soloEnServidor: true, cliente: { id: "srv-1" } });
  });

  it("sin señal o en modo local no frena el alta", async () => {
    setModoLocal(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const v = await verificarClienteNuevo(OWNER, { nombre: "Nueva", telefono: "3129999999" });
    expect(v).toEqual({ tipo: "nuevo" });
    expect(fetchMock).not.toHaveBeenCalled();
    setModoLocal(false);
  });
});
