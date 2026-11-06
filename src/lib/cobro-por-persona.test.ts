import { describe, expect, it } from "vitest";
import { agruparPorPersona, esDePersonas, hayBeneficiarios, leerPersonas, TITULAR } from "./cobro-por-persona";

const cuotas = [
  { id: 1, pendiente: 675, beneficiarioId: null, beneficiarioNombre: null },
  { id: 2, pendiente: 450, beneficiarioId: "b-alex", beneficiarioNombre: "Alejandro" },
  { id: 3, pendiente: 300, beneficiarioId: "b-lupe", beneficiarioNombre: "Lupe" },
  { id: 4, pendiente: 450, beneficiarioId: "b-alex", beneficiarioNombre: "Alejandro" },
];

describe("cobro por persona", () => {
  it("agrupa con el titular primero y suma lo de cada quien", () => {
    const p = agruparPorPersona(cuotas, "Estela", (c) => c.pendiente);
    expect(p.map((x) => [x.nombre, x.total, x.items.length])).toEqual([
      ["Estela", 675, 1],
      ["Alejandro", 900, 2],
      ["Lupe", 300, 1],
    ]);
    expect(p[0].esTitular).toBe(true);
  });
  it("sin beneficiarios no hay nada que elegir (pantalla de siempre)", () => {
    expect(hayBeneficiarios([{ beneficiarioId: null }, {}])).toBe(false);
    expect(hayBeneficiarios(cuotas)).toBe(true);
  });
  it("filtra por personas; sin lista son todas", () => {
    expect(cuotas.filter((c) => esDePersonas(c.beneficiarioId, undefined))).toHaveLength(4);
    expect(cuotas.filter((c) => esDePersonas(c.beneficiarioId, [TITULAR])).map((c) => c.id)).toEqual([1]);
    expect(cuotas.filter((c) => esDePersonas(c.beneficiarioId, ["b-alex", "b-lupe"])).map((c) => c.id)).toEqual([2, 3, 4]);
  });
  it("valida lo que llega del teléfono", () => {
    expect(leerPersonas(undefined)).toBeUndefined();
    expect(leerPersonas([])).toBeUndefined();
    expect(leerPersonas(["b-alex", 3, "", "x".repeat(50)])).toEqual(["b-alex"]);
  });
});
