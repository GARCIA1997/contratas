import { describe, expect, it } from "vitest";
import { FUNCIONES, esClaveFuncion } from "./funciones";

describe("catálogo de funciones en prueba", () => {
  it("reconoce solo claves del catálogo", () => {
    expect(esClaveFuncion("beneficiarios")).toBe(true);
    expect(esClaveFuncion("inventada")).toBe(false);
    expect(esClaveFuncion("toString")).toBe(false);
  });
  it("cada función tiene nombre y descripción para el monitor", () => {
    for (const f of Object.values(FUNCIONES)) {
      expect(f.nombre.length).toBeGreaterThan(0);
      expect(f.descripcion.length).toBeGreaterThan(0);
    }
  });
});
