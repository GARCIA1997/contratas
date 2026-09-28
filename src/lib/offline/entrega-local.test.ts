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

import { prepararEntregaLocal } from "@/lib/offline/entrega-local";
import { enqueue, flushQueue } from "@/lib/offline/queue";
import { LIMITE_OPERACIONES_LOCALES, setModoLocal } from "@/lib/offline/modo-local";

if (!maybeDb) throw new Error("db no inicializada");
const db = maybeDb;
const OWNER = "owner-1";
const HOY = new Date(2026, 8, 27, 12);

async function seed() {
  await db.clientes.add({
    id: "cli-1",
    ownerId: OWNER,
    nombre: "Ana",
    telefono: "5512345678",
    direccion: null,
    referencia: null,
    notas: null,
    creadoEn: HOY.toISOString(),
  });
  await db.contratas.add({
    id: "vieja",
    ownerId: OWNER,
    clienteId: "cli-1",
    clienteNombre: "Ana",
    clienteTelefono: "5512345678",
    tipo: "SEMANAL",
    monto: 5000,
    abono: 600,
    fechaInicio: new Date(2026, 8, 1).toISOString(),
    numCuotas: 3,
    mes: "septiembre 2026",
    notas: null,
    convertidaADeuda: false,
    deudorId: null,
    creadoEn: HOY.toISOString(),
  });
  // Cuota 1 vencida, 2 vigente (dentro de la ventana), 3 lejana.
  const fechas = [new Date(2026, 8, 20), new Date(2026, 8, 28), new Date(2026, 9, 20)];
  await db.pagos.bulkAdd(
    fechas.map((f, i) => ({
      id: `vieja-p${i + 1}`,
      contrataId: "vieja",
      ownerId: OWNER,
      numeroCuota: i + 1,
      fechaProgramada: f.toISOString(),
      fechaPago: null,
      pagado: false,
      montoAbonado: i === 0 ? 100 : 0,
    }))
  );
}

const INPUT = {
  tipo: "SEMANAL" as const,
  monto: 8000,
  abono: 1000,
  fechaInicio: "2026-10-05",
  numCuotas: 10,
  notas: null,
};

beforeEach(async () => {
  setModoLocal(true);
  await Promise.all([
    db.clientes.clear(),
    db.contratas.clear(),
    db.pagos.clear(),
    db.writeQueue.clear(),
    db.configuracion.clear(),
  ]);
  await seed();
});

describe("prepararEntregaLocal", () => {
  it("arma la contrata con su id, sus cuotas y el recibo para WhatsApp", async () => {
    const e = await prepararEntregaLocal(OWNER, {
      id: "11111111-1111-4111-8111-111111111111",
      clienteId: "cli-1",
      input: INPUT,
      hoy: HOY,
    });
    expect(e.filas.contrata.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(e.filas.contrata._dirty).toBe(true);
    expect(e.filas.pagos).toHaveLength(10);
    expect(e.recibo.cliente).toEqual({ nombre: "Ana", telefono: "5512345678" });
    expect(e.recibo.pagos.map((p) => p.numeroCuota)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(e.recibo.otrasLiquidadas).toEqual([]);
  });

  it("incluir otras: cubre solo lo vencido/vigente, con lo que falta de cada cuota", async () => {
    const e = await prepararEntregaLocal(OWNER, {
      id: "22222222-2222-4222-8222-222222222222",
      clienteId: "cli-1",
      input: INPUT,
      hoy: HOY,
      cubrirVencidasDe: ["vieja"],
    });
    expect(e.filas.liquidar).toEqual([
      { contrataId: "vieja", abono: 600, pagoIds: ["vieja-p1", "vieja-p2"] },
    ]);
    expect(e.recibo.otrasLiquidadas?.[0].cuotas).toEqual([
      { numeroCuota: 1, monto: 500 },
      { numeroCuota: 2, monto: 600 },
    ]);
    expect(e.recibo.otrasLiquidadas?.[0].subtotal).toBe(1100);
  });

  it("renovar: toma el cliente de la contrata original y la liquida completa", async () => {
    const e = await prepararEntregaLocal(OWNER, {
      id: "33333333-3333-4333-8333-333333333333",
      input: INPUT,
      hoy: HOY,
      liquidarCompletas: ["vieja"],
    });
    expect(e.filas.contrata.clienteId).toBe("cli-1");
    expect(e.filas.liquidar[0].pagoIds).toEqual(["vieja-p1", "vieja-p2", "vieja-p3"]);
  });

  it("al encolarla aparece en el teléfono y las cuotas cubiertas quedan pagadas", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    const e = await prepararEntregaLocal(OWNER, {
      id,
      clienteId: "cli-1",
      input: INPUT,
      hoy: HOY,
      cubrirVencidasDe: ["vieja"],
    });
    await enqueue(OWNER, "contrata.crear", { ...INPUT, clienteId: "cli-1", id, _local: e.filas });
    expect(await db.contratas.get(id)).toBeTruthy();
    expect(await db.pagos.where("contrataId").equals(id).count()).toBe(10);
    expect((await db.pagos.get("vieja-p1"))?.pagado).toBe(true);
    expect((await db.pagos.get("vieja-p3"))?.pagado).toBe(false);
  });
});

describe("modo local", () => {
  it("no manda nada al servidor aunque haya señal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await enqueue(OWNER, "contrata.pago.toggle", { contrataId: "vieja", numeroCuota: 1 });
    await flushQueue(OWNER);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await db.writeQueue.count()).toBe(1);
  });

  it("bloquea al llegar al límite de movimientos sin sincronizar", async () => {
    await db.writeQueue.bulkAdd(
      Array.from({ length: LIMITE_OPERACIONES_LOCALES }, (_, i) => ({
        id: `op-${i}`,
        ownerId: OWNER,
        type: "contrata.pago.toggle" as const,
        payload: { contrataId: "vieja", numeroCuota: 1 },
        createdAt: new Date(2026, 8, 27, 0, 0, i).toISOString(),
        status: "pending" as const,
        attempts: 0,
      }))
    );
    await expect(
      enqueue(OWNER, "contrata.pago.toggle", { contrataId: "vieja", numeroCuota: 2 })
    ).rejects.toThrow(/límite/);
  });
});
