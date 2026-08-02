import { beforeEach, describe, expect, it, vi } from "vitest";
import { db as maybeDb } from "@/lib/offline/db";

const syncMocks = vi.hoisted(() => ({
  syncContratas: vi.fn().mockResolvedValue(undefined),
  syncClientes: vi.fn().mockResolvedValue(undefined),
  syncDeudores: vi.fn().mockResolvedValue(undefined),
  syncDeudorDetalle: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/offline/sync", () => syncMocks);
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import {
  conflictCount,
  enqueue,
  flushQueue,
  pendingCount,
  reintentarConflictos,
} from "@/lib/offline/queue";

if (!maybeDb) throw new Error("db no inicializada — ¿falta jsdom/fake-indexeddb?");
const db = maybeDb;

const OWNER = "owner-1";

async function seedContrata(id = "c1") {
  await db.contratas.add({
    id,
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
  });
  await db.pagos.add({
    id: `${id}-p1`,
    contrataId: id,
    ownerId: OWNER,
    numeroCuota: 1,
    fechaProgramada: new Date(2026, 6, 8).toISOString(),
    fechaPago: null,
    pagado: false,
    montoAbonado: 0,
  });
}

beforeEach(async () => {
  await Promise.all([db.contratas.clear(), db.pagos.clear(), db.writeQueue.clear()]);
  vi.restoreAllMocks();
  Object.values(syncMocks).forEach((fn) => fn.mockClear());
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("enqueue", () => {
  it("aplica el efecto local de inmediato y encola la operación", async () => {
    await seedContrata();
    // Evita que el auto-flush interno interfiera con esta aserción.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });

    const pago = await db.pagos.get("c1-p1");
    expect(pago?.pagado).toBe(true); // efecto optimista ya aplicado

    const pendientes = await db.writeQueue.where("ownerId").equals(OWNER).toArray();
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].status).toBe("pending");
    expect(pendientes[0].type).toBe("contrata.pago.toggle");
  });
});

describe("flushQueue", () => {
  it("no hace nada si no hay conexión", async () => {
    await seedContrata();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await flushQueue(OWNER);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await pendingCount(OWNER)).toBe(1);
  });

  it("en éxito: borra el item de la cola y envía la Idempotency-Key = id de la operación", async () => {
    await seedContrata();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    const [op] = await db.writeQueue.where("ownerId").equals(OWNER).toArray();

    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contratas/c1/pagos/1/toggle",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": op.id }),
      })
    );
    expect(await pendingCount(OWNER)).toBe(0);
    // Sin más pendientes para c1, _dirty se limpia.
    expect((await db.contratas.get("c1"))?._dirty).toBe(false);
  });

  it("en 4xx: marca 'conflict' y detiene el drenado (no procesa las operaciones siguientes)", async () => {
    await seedContrata("c1");
    await seedContrata("c2");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c2", numeroCuota: 1 });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(fetchMock).toHaveBeenCalledTimes(1); // se detuvo tras el primer conflicto
    const restantes = (
      await db.writeQueue.where("ownerId").equals(OWNER).toArray()
    ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(restantes).toHaveLength(2);
    expect(restantes[0].status).toBe("conflict");
    expect(restantes[1].status).toBe("pending"); // nunca se procesó
  });

  it("en 5xx o error de red: marca 'failed' con attempts incrementado, y se puede reintentar", async () => {
    await seedContrata();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    const [op] = await db.writeQueue.where("ownerId").equals(OWNER).toArray();
    expect(op.status).toBe("failed");
    expect(op.attempts).toBe(1);
    expect(op.lastError).toBe("network down");

    // Reintento exitoso: el item 'failed' se vuelve a recoger.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await flushQueue(OWNER);
    expect(await pendingCount(OWNER)).toBe(0);
  });

  it("no duplica la solicitud si flushQueue ya está corriendo (guard de reentrancia)", async () => {
    await seedContrata();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });

    let resolveFetch: (v: Response) => void;
    const pending = new Promise<Response>((r) => (resolveFetch = r));
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    const p1 = flushQueue(OWNER);
    const p2 = flushQueue(OWNER); // debe volver de inmediato, sin llamar fetch otra vez
    resolveFetch!(new Response(null, { status: 200 }));
    await Promise.all([p1, p2]);

    expect(await pendingCount(OWNER)).toBe(0);
  });

  it("reconciliarTrasExito: contrata.renovar dispara syncContratas tras confirmarse", async () => {
    await seedContrata("c1");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.renovar", { contrataId: "c1", otrasIds: [], input: {} });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(syncMocks.syncContratas).toHaveBeenCalledWith(OWNER);
  });

  it("reconciliarTrasExito: contrata.crear dispara syncContratas y syncClientes (sin tocar Dexie antes)", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.crear", {
      clienteId: "cli-1",
      tipo: "SEMANAL",
      monto: 5000,
      abono: 600,
      fechaInicio: "2026-07-01",
      numCuotas: 10,
      notas: null,
    });
    // Efecto local: ninguno — no hay id de contrata todavía.
    expect(await db.contratas.count()).toBe(0);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(syncMocks.syncContratas).toHaveBeenCalledWith(OWNER);
    expect(syncMocks.syncClientes).toHaveBeenCalledWith(OWNER);
    expect(await pendingCount(OWNER)).toBe(0);
  });

  it("reconciliarTrasExito: contrata.marcarDeuda dispara syncContratas y syncDeudores", async () => {
    await seedContrata("c1");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.marcarDeuda", { contrataId: "c1" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(syncMocks.syncContratas).toHaveBeenCalledWith(OWNER);
    expect(syncMocks.syncDeudores).toHaveBeenCalledWith(OWNER);
  });

  it("en 4xx: la operación queda en 'conflict' y no se reintenta sola en un flush posterior", async () => {
    await seedContrata("c1");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(await conflictCount(OWNER)).toBe(1);
    expect(await pendingCount(OWNER)).toBe(1); // sigue en la cola, solo que atorada

    // Un flush normal posterior (p. ej. otra operación disparándolo) NO la toca.
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await flushQueue(OWNER);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await conflictCount(OWNER)).toBe(1);
  });

  it("reintentarConflictos: regresa las operaciones en conflicto a 'pending' y las reintenta", async () => {
    await seedContrata("c1");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);
    expect(await conflictCount(OWNER)).toBe(1);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await reintentarConflictos(OWNER);

    expect(await conflictCount(OWNER)).toBe(0);
    expect(await pendingCount(OWNER)).toBe(0);
  });
});
