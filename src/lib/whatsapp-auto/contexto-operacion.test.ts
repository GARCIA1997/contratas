import { afterEach, describe, expect, it } from "vitest";
import { fechaCapturaActual, registrarAlmacen } from "./contexto-operacion";

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
