import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { precargarRutaDelDia } from "@/lib/offline/precarga-ligera";

function fingirRed(effectiveType: string, onLine = true) {
  Object.defineProperty(navigator, "onLine", { value: onLine, configurable: true });
  Object.defineProperty(navigator, "connection", {
    value: { effectiveType, saveData: false },
    configurable: true,
  });
}

/** Genera ids como los de la cartera real (cientos de registros). */
function idsGrandes() {
  const n = (p: string, k: number) => Array.from({ length: k }, (_, i) => `${p}${i}`);
  return { contratas: n("c", 303), clientes: n("k", 189), deudores: n("d", 24) };
}

describe("precargarRutaDelDia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fingirRed("4g");
  });
  afterEach(() => vi.useRealTimers());

  it("nunca precarga más de 60 pantallas, por grande que sea la cartera", () => {
    // Con la cartera real, la versión anterior disparaba ~2,235 peticiones
    // seguidas: en 3G eso saturaba la conexión durante minutos.
    const router = { prefetch: vi.fn() };
    precargarRutaDelDia(router, idsGrandes());
    vi.advanceTimersByTime(120_000);
    expect(router.prefetch.mock.calls.length).toBeLessThanOrEqual(60);
  });

  it("va en tandas pequeñas en vez de disparar todo de golpe", () => {
    const router = { prefetch: vi.fn() };
    precargarRutaDelDia(router, idsGrandes());
    const primeraTanda = router.prefetch.mock.calls.length;
    expect(primeraTanda).toBeLessThanOrEqual(4);

    vi.advanceTimersByTime(1000);
    expect(router.prefetch.mock.calls.length).toBeGreaterThan(primeraTanda);
  });

  it("no precarga nada si la red es lenta", () => {
    fingirRed("3g");
    const router = { prefetch: vi.fn() };
    precargarRutaDelDia(router, idsGrandes());
    vi.advanceTimersByTime(60_000);
    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it("se detiene a media precarga si la señal se degrada", () => {
    // En campo la señal cambia mientras uno camina; seguir precargando
    // sobre una red que acaba de caer es justo lo que trababa la app.
    const router = { prefetch: vi.fn() };
    precargarRutaDelDia(router, idsGrandes());
    vi.advanceTimersByTime(2000);
    const antes = router.prefetch.mock.calls.length;
    expect(antes).toBeGreaterThan(0);

    fingirRed("3g");
    vi.advanceTimersByTime(60_000);
    expect(router.prefetch.mock.calls.length).toBe(antes);
  });

  it("cancelar detiene las tandas siguientes", () => {
    const router = { prefetch: vi.fn() };
    const cancelar = precargarRutaDelDia(router, idsGrandes());
    const antes = router.prefetch.mock.calls.length;
    cancelar();
    vi.advanceTimersByTime(60_000);
    expect(router.prefetch.mock.calls.length).toBe(antes);
  });

  it("prioriza las pantallas fijas de uso diario antes que los registros", () => {
    const router = { prefetch: vi.fn() };
    precargarRutaDelDia(router, idsGrandes());
    const primeras = router.prefetch.mock.calls.map((c) => c[0]);
    expect(primeras).toContain("/ruta");
  });
});
