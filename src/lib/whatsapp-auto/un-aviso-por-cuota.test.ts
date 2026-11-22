import { describe, expect, it } from "vitest";
import { unAvisoPorCuota } from "./planificar";

/** Casos reales del 22-nov: avisos que no salieron su día se juntaban con el nuevo de la misma cuota. */
const aviso = (id: string, tipo: string, contrataId: string | null, numeroCuota: number | null, creado: string) => ({
  id,
  tipo,
  contrataId,
  numeroCuota,
  creadoEn: new Date(creado),
});

describe("unAvisoPorCuota", () => {
  it("Eduardo: 'el mismo día' de ayer + vencida de hoy → solo la vencida", () => {
    const r = unAvisoPorCuota([
      aviso("d0", "POR_VENCER", "f9e5", 3, "2026-11-22T02:45:33Z"),
      aviso("v", "VENCIDA", "f9e5", 3, "2026-11-22T06:45:33Z"),
    ]);
    expect(r.quedan.map((m) => m.id)).toEqual(["v"]);
    expect(r.reemplazados.map((m) => m.id)).toEqual(["d0"]);
  });

  it("'1 día antes' de ayer + 'el mismo día' de hoy → solo el de hoy", () => {
    const r = unAvisoPorCuota([
      aviso("d1", "POR_VENCER", "c7", 7, "2026-11-22T02:45:33Z"),
      aviso("d0", "POR_VENCER", "c7", 7, "2026-11-22T15:00:00Z"),
    ]);
    expect(r.quedan.map((m) => m.id)).toEqual(["d0"]);
  });

  it("cuotas distintas del mismo cliente siguen juntas en un mensaje", () => {
    const r = unAvisoPorCuota([
      aviso("a", "POR_VENCER", "c1", 7, "2026-11-22T15:00:00Z"),
      aviso("b", "POR_VENCER", "c1", 8, "2026-11-22T15:00:00Z"),
      aviso("c", "VENCIDA", "c2", 2, "2026-11-22T15:00:00Z"),
    ]);
    expect(r.quedan.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(r.reemplazados).toEqual([]);
  });

  it("los avisos sin cuota (deudores) no se tocan", () => {
    const r = unAvisoPorCuota([aviso("x", "DEUDOR", null, null, "2026-11-22T15:00:00Z"), aviso("y", "DEUDOR", null, null, "2026-11-22T16:00:00Z")]);
    expect(r.quedan.length).toBe(2);
  });
});
