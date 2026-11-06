import { describe, expect, it } from "vitest";
import { beneficiariosParecidos, buscarPorNombre, limpiarNombre, normalizarNombre } from "./beneficiarios";

describe("beneficiarios", () => {
  it("normaliza mayúsculas, acentos y espacios", () => {
    expect(normalizarNombre("  ALEJÁNDRO   García ")).toBe("alejandro garcia");
    expect(normalizarNombre("alejandro garcía")).toBe(normalizarNombre("Alejandro  Garcia"));
    expect(limpiarNombre("  Lupe   Comadre ")).toBe("Lupe Comadre");
  });
  it("encuentra el mismo nombre escrito distinto", () => {
    const lista = [{ id: "1", nombre: "Alejandro" }, { id: "2", nombre: "Lupe" }];
    expect(buscarPorNombre("ALEJÁNDRO", lista)?.id).toBe("1");
    expect(buscarPorNombre("Alex", lista)).toBeUndefined();
  });
  it("sugiere parecidos sin confundir nombres distintos", () => {
    const lista = [{ nombre: "Alejandro" }, { nombre: "Lupe" }, { nombre: "Juan" }];
    expect(beneficiariosParecidos("Alex", lista).map((b) => b.nombre)).toEqual(["Alejandro"]);
    expect(beneficiariosParecidos("Alejadro", lista).map((b) => b.nombre)).toEqual(["Alejandro"]);
    expect(beneficiariosParecidos("Lupita", lista).map((b) => b.nombre)).toEqual(["Lupe"]);
    expect(beneficiariosParecidos("Pedro", lista)).toEqual([]);
  });
});
