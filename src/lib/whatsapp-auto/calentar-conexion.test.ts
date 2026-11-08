import { describe, expect, it } from "vitest";
import { antesDeEnviar } from "./reglas";

const MIN = 60_000;
const ahora = Date.UTC(2026, 10, 8, 16, 3, 58); // 10:03:58 CDMX del 8 de noviembre

describe("antesDeEnviar (calentar la conexión tras inactividad)", () => {
  it("el caso del 8-nov: abierta hace 2 h y sin enviar en 12.5 h → reconectar primero", () => {
    expect(antesDeEnviar(ahora, ahora - 112 * MIN, ahora - 752 * MIN)).toBe("calentar");
  });
  it("el caso del 5-nov: recién reconectada pero 22 h sin enviar → reconectar primero", () => {
    expect(antesDeEnviar(ahora, ahora - 1 * MIN, ahora - 22 * 60 * MIN)).toBe("calentar");
  });
  it("con envíos recientes se manda directo", () => {
    expect(antesDeEnviar(ahora, ahora - 30 * MIN, ahora - 5 * MIN)).toBe("listo");
  });
  it("recién abierta (o recién calentada) espera unos segundos y luego manda", () => {
    expect(antesDeEnviar(ahora, ahora - 3_000, ahora - 3_000)).toBe("asentando");
    expect(antesDeEnviar(ahora, ahora - 11_000, ahora - 11_000)).toBe("listo");
  });
});
