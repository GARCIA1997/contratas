import { beforeEach, describe, expect, it, vi } from "vitest";
import { db as maybeDb } from "@/lib/offline/db";

const syncMocks = vi.hoisted(() => ({
  syncContratas: vi.fn().mockResolvedValue(undefined),
  syncClientes: vi.fn().mockResolvedValue(undefined),
  syncDeudores: vi.fn().mockResolvedValue(undefined),
  syncDeudorDetalle: vi.fn().mockResolvedValue(undefined),
  syncCitas: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/offline/sync", () => syncMocks);
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportarError: vi.fn() }));

import {
  conflictCount,
  enqueue,
  enqueueLote,
  flushQueue,
  pendingCount,
  reintentarConflictos,
} from "@/lib/offline/queue";

import { LIMITE_OPERACIONES_LOCALES } from "@/lib/offline/modo-local";
import { cancelarReintento, reiniciarEsperas } from "@/lib/offline/cola/estado";

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
  // Los reintentos programados son estado de módulo: que no se crucen entre tests.
  cancelarReintento();
  reiniciarEsperas();
  await Promise.all([
    db.contratas.clear(),
    db.pagos.clear(),
    db.writeQueue.clear(),
    db.clientes.clear(),
  ]);
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

describe("enqueueLote", () => {
  it("si no caben todas, no encola ninguna (sin cliente huérfano)", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await db.writeQueue.bulkAdd(
      Array.from({ length: LIMITE_OPERACIONES_LOCALES - 1 }, (_, i) => ({
        id: `x${i}`,
        ownerId: OWNER,
        type: "contrata.pago.toggle" as const,
        payload: { contrataId: "zz", numeroCuota: 1 },
        createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        status: "pending" as const,
        attempts: 0,
      }))
    );
    await expect(
      enqueueLote(OWNER, [
        { type: "cliente.crear", payload: { id: "cli-n", ownerId: OWNER, nombre: "Ana" } },
        { type: "contrata.crear", payload: { id: "c-n", clienteId: "cli-n" } },
      ])
    ).rejects.toThrow(/límite/);
    expect(await pendingCount(OWNER)).toBe(LIMITE_OPERACIONES_LOCALES - 1);
    expect(await db.clientes.get("cli-n")).toBeUndefined();
  });
});

describe("clave heredada (guardar.ts)", () => {
  it("la primera operación del lote viaja con la Idempotency-Key del intento directo; las ligadas con la suya", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueueLote(
      OWNER,
      [
        { type: "contrata.crear", payload: { id: "nueva", clienteId: "cli-1" } },
        { type: "cita.entregar", payload: { citaId: "cita-1", contrataCreadaId: "nueva" } },
      ],
      { clave: "clave-del-intento-directo" }
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    const claves = fetchMock.mock.calls.map(
      (c) => (c[1].headers as Record<string, string>)["Idempotency-Key"]
    );
    expect(claves[0]).toBe("clave-del-intento-directo");
    expect(claves[1]).not.toBe("clave-del-intento-directo");
  });
});

describe("liberación de _dirty", () => {
  it("una contrata liquidada por una entrega pendiente NO se libera al confirmarse otro cobro suyo", async () => {
    await seedContrata("y");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "y", numeroCuota: 1 });
    await enqueue(OWNER, "contrata.crear", {
      id: "nueva",
      clienteId: "cli-1",
      _local: {
        contrata: { id: "nueva", clienteId: "cli-1" },
        pagos: [],
        liquidar: [{ contrataId: "y", abono: 600, pagoIds: [] }],
      },
    });
    // Solo el primero llega; el segundo se corta por red.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockRejectedValue(new TypeError("sin red"));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect((await db.contratas.get("y"))?._dirty).toBe(true);
  });
});

describe("flushQueue", () => {
  it("si se corta por red, programa un reintento automático (señal intermitente no dispara eventos)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await seedContrata("c1");
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("sin red"))
        .mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      await flushQueue(OWNER);
      expect(await pendingCount(OWNER)).toBe(1);

      await vi.advanceTimersByTimeAsync(15_000);
      await vi.waitFor(async () => expect(await pendingCount(OWNER)).toBe(0));
    } finally {
      vi.useRealTimers();
    }
  });

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

  it("en 4xx: marca 'conflict' pero sigue con las demás (un rechazo no atora la cola)", async () => {
    await seedContrata("c1");
    await seedContrata("c2");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c2", numeroCuota: 1 });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    const restantes = await db.writeQueue.where("ownerId").equals(OWNER).toArray();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].status).toBe("conflict");
    expect((restantes[0].payload as { contrataId: string }).contrataId).toBe("c1");
  });

  it("en 4xx: aparta también las operaciones posteriores que tocan la misma entidad (no invierte un toggle)", async () => {
    await seedContrata("c1");
    await seedContrata("c2");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c2", numeroCuota: 1 });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    // Solo se mandó el rechazado y el de c2 — el segundo toggle de c1 no.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/contratas/c2/");
    const restantes = await db.writeQueue.where("ownerId").equals(OWNER).toArray();
    expect(restantes).toHaveLength(2);
    expect(restantes.every((op) => op.status === "conflict")).toBe(true);
  });

  it("en 4xx de una entrega: cita.entregar que apunta a esa contrata no se manda (evita FK → 500 → cola atorada)", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueueLote(OWNER, [
      { type: "contrata.crear", payload: { id: "nueva", clienteId: "cli-1", tipo: "SEMANAL" } },
      { type: "cita.entregar", payload: { citaId: "cita-1", contrataCreadaId: "nueva" } },
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await conflictCount(OWNER)).toBe(2);
  });

  it("en 5xx: detiene el drenado para respetar el orden", async () => {
    await seedContrata("c1");
    await seedContrata("c2");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c2", numeroCuota: 1 });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const restantes = (
      await db.writeQueue.where("ownerId").equals(OWNER).toArray()
    ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(restantes.map((r) => r.status)).toEqual(["failed", "pending"]);
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

  it("recoge un item atorado en 'syncing' (petición anterior que nunca resolvió, p. ej. la app se cerró a media petición) en el siguiente flush", async () => {
    await seedContrata("c1");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    const [op] = await db.writeQueue.where("ownerId").equals(OWNER).toArray();
    // Simula una sesión anterior que quedó a medias (nunca llegó a "conflict",
    // "failed" ni se borró) — sin el fix, este item quedaba excluido para
    // siempre del filtro de `pendientes` en flushQueue.
    await db.writeQueue.update(op.id, { status: "syncing" });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await flushQueue(OWNER);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await pendingCount(OWNER)).toBe(0);
  });

  it("reintentarConflictos también regresa a 'pending' los items atorados en 'syncing'", async () => {
    await seedContrata("c1");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "c1", numeroCuota: 1 });
    const [op] = await db.writeQueue.where("ownerId").equals(OWNER).toArray();
    await db.writeQueue.update(op.id, { status: "syncing" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await reintentarConflictos(OWNER);

    expect(await pendingCount(OWNER)).toBe(0);
  });

  it("dos enqueue seguidos sin esperar el flush del primero (igual que 'Cobrado' en Ruta con 2 contratas) sincronizan ambas operaciones, no solo la primera", async () => {
    // Bug reportado en campo: un cliente con 2 contratas, al marcar
    // "Cobrado" en Ruta (que hace un `enqueue` por cuota, uno por cada
    // contrata, sin esperar a que el primero termine de enviarse), solo una
    // de las dos se aplicaba en el servidor — la otra se quedaba "pending"
    // sin que nada la reintentara, aunque el recibo (armado del lado del
    // cliente) mostrara ambas como cobradas. Causa: el segundo `enqueue`
    // dispara su propio `flushQueue`, pero como el primero todavía sigue en
    // vuelo (esperando el fetch), el guard `flushing` hacía que ese segundo
    // intento no hiciera nada — y nada más lo volvía a intentar.
    await seedContrata("c1");
    await seedContrata("c2");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    const fetchMock = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Igual que el for-loop de marcarCobrado en ruta/page.tsx.
    await enqueue(OWNER, "contrata.pago.abonar", { contrataId: "c1", numeroCuota: 1, monto: 600 });
    await enqueue(OWNER, "contrata.pago.abonar", { contrataId: "c2", numeroCuota: 1, monto: 600 });

    // Deja que el flush disparado por el segundo enqueue (que antes se
    // perdía en silencio) alcance a correr en segundo plano.
    await new Promise((r) => setTimeout(r, 100));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await pendingCount(OWNER)).toBe(0);
  });
});
