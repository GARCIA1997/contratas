import { afterEach, describe, expect, it } from "vitest";
import { fechaCapturaActual, hoyDelCobro, registrarAlmacen } from "./contexto-operacion";

const con = (captura: string | null) => registrarAlmacen({ getStore: () => ({ clave: "k", captura }) });
const ahora = new Date("2026-10-15T18:00:00Z");

describe("fechaCapturaActual (fecha del recibo de lo hecho sin señal)", () => {
  afterEach(() => registrarAlmacen({ getStore: () => undefined }));
  it("usa la hora en que se capturó la operación", () => {
    con("2026-10-13T16:30:00Z");
    expect(fechaCapturaActual(ahora)?.toISOString()).toBe("2026-10-13T16:30:00.000Z");
  });
  it("ignora fechas futuras, de hace más de 7 días o ausentes", () => {
    con("2026-10-16T00:00:00Z");
    expect(fechaCapturaActual(ahora)).toBeNull();
    con("2026-10-01T00:00:00Z");
    expect(fechaCapturaActual(ahora)).toBeNull();
    con(null);
    expect(fechaCapturaActual(ahora)).toBeNull();
  });
});

describe("hoyDelCobro (con qué día se decide qué cuotas cobrar)", () => {
  afterEach(() => registrarAlmacen({ getStore: () => undefined }));
  it("lo capturado sin señal se cobra al día de la captura, aunque suba días después", () => {
    con("2026-10-01T16:30:00Z"); // 14 días antes: el recibo ya no la usa, el cobro sí
    expect(hoyDelCobro(ahora).toISOString()).toBe("2026-10-01T16:30:00.000Z");
  });
  it("con señal (sin captura), con reloj adelantado o de hace más de 60 días, usa ahora", () => {
    con(null);
    expect(hoyDelCobro(ahora)).toBe(ahora);
    con("2026-10-16T00:00:00Z");
    expect(hoyDelCobro(ahora)).toBe(ahora);
    con("2026-07-01T00:00:00Z");
    expect(hoyDelCobro(ahora)).toBe(ahora);
  });
});
