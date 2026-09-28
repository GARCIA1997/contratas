import { beforeEach, describe, expect, it, vi } from "vitest";

const colaMock = vi.hoisted(() => ({ enqueueLote: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/offline/queue", () => colaMock);

const conexionMock = vi.hoisted(() => ({ local: false }));
vi.mock("@/lib/offline/conexion", async (orig) => ({
  ...(await orig<typeof import("@/lib/offline/conexion")>()),
  debeTrabajarLocal: () => conexionMock.local,
}));

import { guardarOperacion, RechazoDelServidor } from "@/lib/offline/guardar";
import type { OperacionCola } from "@/lib/offline/cola/peticiones";

const ENTREGA: OperacionCola = {
  type: "contrata.crear",
  payload: { id: "c-1", clienteId: "cli-1", monto: 1000, _local: { contrata: { id: "c-1" } } },
};
const ENLACE: OperacionCola = {
  type: "cita.entregar",
  payload: { citaId: "cita-1", contrataCreadaId: "c-1" },
};

beforeEach(() => {
  colaMock.enqueueLote.mockClear();
  conexionMock.local = false;
  vi.unstubAllGlobals();
});

describe("guardarOperacion", () => {
  it("sin señal / modo local: encola el lote completo con la clave, sin tocar la red", async () => {
    conexionMock.local = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const r = await guardarOperacion({ ownerId: "o", clave: "K", lote: [ENTREGA, ENLACE] });

    expect(r.enServidor).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(colaMock.enqueueLote).toHaveBeenCalledWith("o", [ENTREGA, ENLACE], { clave: "K" });
  });

  it("con señal: manda con la clave, sin `_local`, y encola solo lo ligado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "c-1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await guardarOperacion<{ id: string }>({ ownerId: "o", clave: "K", lote: [ENTREGA, ENLACE] });

    expect(r).toEqual({ enServidor: true, datos: { id: "c-1" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("K");
    expect(JSON.parse(init.body)).not.toHaveProperty("_local");
    expect(colaMock.enqueueLote).toHaveBeenCalledWith("o", [ENLACE]);
  });

  it("señal que se cae a medio camino: encola LA MISMA operación con LA MISMA clave (el servidor no la duplica)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const r = await guardarOperacion({ ownerId: "o", clave: "K", lote: [ENTREGA, ENLACE] });

    expect(r.enServidor).toBe(false);
    expect(colaMock.enqueueLote).toHaveBeenCalledWith("o", [ENTREGA, ENLACE], { clave: "K" });
  });

  it("5xx: también a la cola (transitorio), con la misma clave", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    const r = await guardarOperacion({ ownerId: "o", clave: "K", lote: [ENTREGA] });
    expect(r.enServidor).toBe(false);
    expect(colaMock.enqueueLote).toHaveBeenCalledWith("o", [ENTREGA], { clave: "K" });
  });

  it("4xx: rechazo de validación — se muestra, NO se encola", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Monto insuficiente" }), { status: 400 }))
    );
    await expect(guardarOperacion({ ownerId: "o", clave: "K", lote: [ENTREGA] })).rejects.toEqual(
      new RechazoDelServidor("Monto insuficiente", 400)
    );
    expect(colaMock.enqueueLote).not.toHaveBeenCalled();
  });

  it("sin owner (sesión cargando): un fallo de red se propaga, no hay cola a la cual caer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(guardarOperacion({ ownerId: null, clave: "K", lote: [ENTREGA] })).rejects.toThrow();
    expect(colaMock.enqueueLote).not.toHaveBeenCalled();
  });
});
