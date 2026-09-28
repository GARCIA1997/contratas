import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calidadConexion,
  debeTrabajarLocal,
  fetchConTimeout,
  TimeoutDeRed,
} from "@/lib/offline/conexion";
import { setModoLocal } from "@/lib/offline/modo-local";

/** Simula lo que reporta el navegador sobre la red. */
function fingirRed(opts: {
  onLine?: boolean;
  effectiveType?: string;
  saveData?: boolean;
  sinApiConnection?: boolean;
}) {
  Object.defineProperty(navigator, "onLine", {
    value: opts.onLine ?? true,
    configurable: true,
  });
  const connection = opts.sinApiConnection
    ? undefined
    : { effectiveType: opts.effectiveType, saveData: opts.saveData ?? false };
  Object.defineProperty(navigator, "connection", {
    value: connection,
    configurable: true,
  });
}

describe("calidadConexion", () => {
  beforeEach(() => {
    localStorage.clear();
    fingirRed({ onLine: true, effectiveType: "4g" });
  });

  it("el modo local se comporta como sin red aunque haya wifi", () => {
    setModoLocal(true);
    expect(calidadConexion()).toBe("sin-red");
    expect(debeTrabajarLocal()).toBe(true);
    setModoLocal(false);
    expect(calidadConexion()).toBe("rapida");
    expect(debeTrabajarLocal()).toBe(false);
  });

  it("sin red gana sobre cualquier otra señal", () => {
    fingirRed({ onLine: false, effectiveType: "4g" });
    expect(calidadConexion()).toBe("sin-red");
  });

  it("4g es rápida", () => {
    expect(calidadConexion()).toBe("rapida");
  });

  it.each(["slow-2g", "2g", "3g"])("%s se trata como lenta", (tipo) => {
    fingirRed({ onLine: true, effectiveType: tipo });
    expect(calidadConexion()).toBe("lenta");
  });

  it("respeta el ahorro de datos del sistema aunque la red sea rápida", () => {
    fingirRed({ onLine: true, effectiveType: "4g", saveData: true });
    expect(calidadConexion()).toBe("lenta");
  });

  it("sin navigator.connection (iOS) asume rápida en vez de bloquearse", () => {
    fingirRed({ onLine: true, sinApiConnection: true });
    expect(calidadConexion()).toBe("rapida");
  });

  it("sin red gana aunque el navegador reporte un tipo lento", () => {
    fingirRed({ onLine: false, effectiveType: "2g" });
    expect(calidadConexion()).toBe("sin-red");
  });
});

describe("fetchConTimeout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("devuelve la respuesta cuando llega a tiempo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));
    const res = await fetchConTimeout("/api/x", {}, 1000);
    expect(await res.text()).toBe("ok");
  });

  it("aborta y lanza TimeoutDeRed si la red se cuelga", async () => {
    // Una petición que nunca resuelve — exactamente el caso de 3G que
    // dejaba la cola detenida y los botones en "Guardando…" para siempre.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            init.signal?.addEventListener("abort", () =>
              rej(new DOMException("Aborted", "AbortError"))
            );
          })
      )
    );
    await expect(fetchConTimeout("/api/x", {}, 20)).rejects.toBeInstanceOf(
      TimeoutDeRed
    );
  });

  it("propaga un error de red real sin disfrazarlo de timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchConTimeout("/api/x", {}, 1000)).rejects.toBeInstanceOf(TypeError);
  });
});
