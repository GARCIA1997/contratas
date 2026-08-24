import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Un `db` truthy mínimo: basta para que cada sync* llegue hasta el fetch.
// La respuesta se simula como no-ok, así que todas retornan justo después
// sin tocar Dexie — lo que se mide aquí es cuántas veces sale a la red.
vi.mock("@/lib/offline/db", () => ({ db: {} }));

/** Un syncAll completo son estas cinco peticiones. */
const PETICIONES_POR_SYNC = 5;

function fingirRed(effectiveType: string, onLine = true) {
  Object.defineProperty(navigator, "onLine", { value: onLine, configurable: true });
  Object.defineProperty(navigator, "connection", {
    value: { effectiveType, saveData: false },
    configurable: true,
  });
}

/**
 * El mínimo entre syncs automáticos vive en el ámbito del módulo, así que
 * cada prueba necesita el módulo recién cargado para no heredar el reloj
 * de la anterior.
 */
async function cargarSyncLimpio() {
  vi.resetModules();
  return (await import("@/lib/offline/sync")).syncAll;
}

let fetchSpy: ReturnType<typeof vi.fn>;

describe("syncAll", () => {
  beforeEach(() => {
    localStorage.clear();
    fingirRed("4g");
    fetchSpy = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("con buena conexión sí sale a la red", async () => {
    const syncAll = await cargarSyncLimpio();
    await syncAll("owner-1");
    expect(fetchSpy).toHaveBeenCalledTimes(PETICIONES_POR_SYNC);
  });

  it("sin red no sale a la red", async () => {
    const syncAll = await cargarSyncLimpio();
    fingirRed("4g", false);
    await syncAll("owner-1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("en red lenta el automático se abstiene", async () => {
    const syncAll = await cargarSyncLimpio();
    fingirRed("3g");
    await syncAll("owner-1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("en red lenta el forzado sí corre (botón «Recargar datos»)", async () => {
    const syncAll = await cargarSyncLimpio();
    fingirRed("3g");
    await syncAll("owner-1", { forzar: true });
    expect(fetchSpy).toHaveBeenCalledTimes(PETICIONES_POR_SYNC);
  });

  it("varios cambios de conexión seguidos no encadenan syncs completos", async () => {
    // `connection.change` se dispara seguido en un celular en movimiento;
    // sin el mínimo, cada disparo volvía a bajar ~1 MB.
    const syncAll = await cargarSyncLimpio();
    await syncAll("owner-1");
    await syncAll("owner-1");
    await syncAll("owner-1");
    expect(fetchSpy).toHaveBeenCalledTimes(PETICIONES_POR_SYNC);
  });

  it("forzar nunca queda bloqueado por ese mínimo", async () => {
    const syncAll = await cargarSyncLimpio();
    await syncAll("owner-1");
    await syncAll("owner-1", { forzar: true });
    expect(fetchSpy).toHaveBeenCalledTimes(PETICIONES_POR_SYNC * 2);
  });

  it("pasado el mínimo, el automático vuelve a correr", async () => {
    const syncAll = await cargarSyncLimpio();
    await syncAll("owner-1");
    vi.advanceTimersByTime(31_000);
    await syncAll("owner-1");
    expect(fetchSpy).toHaveBeenCalledTimes(PETICIONES_POR_SYNC * 2);
  });
});
