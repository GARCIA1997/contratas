import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Simulacro en memoria de la tabla `ProcessedOperation` con la semántica que
 * importa aquí: el insert falla si la llave primaria ya existe. Eso es lo
 * que convierte la reserva en un candado real y lo que estas pruebas
 * verifican — sin esa atomicidad, dos peticiones con la misma key
 * ejecutarían la mutación las dos (doble cobro).
 */
type Fila = {
  id: string;
  ownerId: string;
  endpoint: string;
  resultado: unknown;
  completada: boolean;
  creadoEn: Date;
};

const tabla = new Map<string, Fila>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    processedOperation: {
      create: async ({ data }: { data: Omit<Fila, "resultado" | "creadoEn"> }) => {
        if (tabla.has(data.id)) throw new Error("Unique constraint failed");
        const fila: Fila = { ...data, resultado: null, creadoEn: new Date() };
        tabla.set(data.id, fila);
        return fila;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        tabla.get(where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Fila>;
      }) => {
        const fila = tabla.get(where.id);
        if (!fila) throw new Error("Record not found");
        Object.assign(fila, data);
        return fila;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; completada: boolean; creadoEn: Date };
        data: Partial<Fila>;
      }) => {
        const fila = tabla.get(where.id);
        const coincide =
          fila &&
          fila.completada === where.completada &&
          fila.creadoEn.getTime() === where.creadoEn.getTime();
        if (!coincide) return { count: 0 };
        Object.assign(fila, data);
        return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        tabla.delete(where.id);
        return {};
      },
    },
  },
}));

// vitest eleva el vi.mock de arriba por encima de estos imports, así que
// `withIdempotency` ya recibe el prisma simulado.
import { withIdempotency } from "@/lib/idempotency";
import { HttpError } from "@/lib/session";
import { claveOperacionActual } from "@/lib/whatsapp-auto/contexto-operacion";

function req(key: string | null) {
  return {
    headers: { get: (n: string) => (n === "Idempotency-Key" ? key : null) },
  } as never;
}

/** Deja pasar un tick para intercalar dos peticiones concurrentes. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("withIdempotency", () => {
  beforeEach(() => tabla.clear());

  it("la mutación ve su Idempotency-Key (clave del recibo automático de WhatsApp)", async () => {
    let vista: string | null = "sin-correr";
    await withIdempotency(req("k-recibo"), "o1", "cobrar", async () => {
      await tick();
      vista = claveOperacionActual();
      return { ok: 1 };
    });
    expect(vista).toBe("k-recibo");
    expect(claveOperacionActual()).toBeNull();
    let sinKey: string | null = "sin-correr";
    await withIdempotency(req(null), "o1", "cobrar", async () => {
      sinKey = claveOperacionActual();
      return {};
    });
    expect(sinKey).toBeNull();
  });

  it("sin key no memoriza nada y siempre ejecuta", async () => {
    const run = vi.fn().mockResolvedValue({ ok: 1 });
    await withIdempotency(req(null), "o1", "cobrar", run);
    await withIdempotency(req(null), "o1", "cobrar", run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(tabla.size).toBe(0);
  });

  it("si la mutación se aplicó pero falla guardar el resultado, responde éxito y NO libera la reserva (el reintento no la vuelve a ejecutar)", async () => {
    const run = vi.fn().mockImplementation(async () => {
      // Simula que la fila desaparece → el update posterior falla.
      tabla.delete("k-f");
      tabla.set("k-f", {
        id: "k-f", ownerId: "o1", endpoint: "crear", resultado: null,
        completada: false, creadoEn: new Date(),
      });
      return { id: "c1" };
    });
    const { prisma } = await import("@/lib/prisma");
    const spy = vi
      .spyOn(prisma.processedOperation, "update")
      .mockRejectedValueOnce(new Error("DB caída"));
    await expect(withIdempotency(req("k-f"), "o1", "crear", run)).resolves.toEqual({ id: "c1" });
    expect(tabla.has("k-f")).toBe(true);
    // Reintento inmediato: la reserva sigue "en curso" → 503, no re-ejecuta.
    await expect(withIdempotency(req("k-f"), "o1", "crear", run)).rejects.toMatchObject({ status: 503 });
    expect(run).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("un reintento después de terminar devuelve el resultado sin volver a ejecutar", async () => {
    const run = vi.fn().mockResolvedValue({ total: 500 });
    const a = await withIdempotency(req("k1"), "o1", "cobrar", run);
    const b = await withIdempotency(req("k1"), "o1", "cobrar", run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ total: 500 });
    expect(b).toEqual({ total: 500 });
  });

  it("dos peticiones concurrentes con la misma key ejecutan la mutación UNA sola vez", async () => {
    // El caso real de 3G: la primera petición se cuelga a media ejecución y
    // el cliente reintenta con la misma key antes de que la primera termine.
    let resolver!: (v: unknown) => void;
    const enVuelo = new Promise((r) => (resolver = r));
    const run = vi.fn().mockReturnValue(enVuelo);

    const primera = withIdempotency(req("k2"), "o1", "cobrar", run);
    await tick(); // la primera ya reservó y está ejecutando

    const segunda = withIdempotency(req("k2"), "o1", "cobrar", run);
    await expect(segunda).rejects.toBeInstanceOf(HttpError);
    await expect(segunda).rejects.toMatchObject({ status: 503 });

    resolver({ total: 700 });
    await expect(primera).resolves.toEqual({ total: 700 });

    // Lo único que de verdad importa: la mutación corrió una sola vez.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("si la mutación falla se libera la reserva para poder reintentar", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("sin cuotas"))
      .mockResolvedValueOnce({ total: 100 });

    await expect(withIdempotency(req("k3"), "o1", "cobrar", run)).rejects.toThrow(
      "sin cuotas"
    );
    expect(tabla.has("k3")).toBe(false);

    await expect(withIdempotency(req("k3"), "o1", "cobrar", run)).resolves.toEqual({
      total: 100,
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retoma una reserva huérfana (el proceso que la tomó murió)", async () => {
    tabla.set("k4", {
      id: "k4",
      ownerId: "o1",
      endpoint: "cobrar",
      resultado: null,
      completada: false,
      // Más vieja que la ventana de 2 min: nadie la va a terminar.
      creadoEn: new Date(Date.now() - 5 * 60 * 1000),
    });
    const run = vi.fn().mockResolvedValue({ total: 900 });
    await expect(withIdempotency(req("k4"), "o1", "cobrar", run)).resolves.toEqual({
      total: 900,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(tabla.get("k4")?.completada).toBe(true);
  });

  it("la misma key para otro endpoint no devuelve el resultado ajeno", async () => {
    const run = vi.fn().mockResolvedValue({ a: 1 });
    await withIdempotency(req("k5"), "o1", "cobrar", run);
    const otro = vi.fn().mockResolvedValue({ b: 2 });
    await expect(withIdempotency(req("k5"), "o1", "renovar", otro)).resolves.toEqual({
      b: 2,
    });
    expect(otro).toHaveBeenCalledTimes(1);
  });
});
