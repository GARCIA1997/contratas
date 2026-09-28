import { describe, expect, it } from "vitest";
import { PANTALLAS_OFFLINE, rutas } from "@/lib/rutas";

describe("rutas", () => {
  it("las pantallas de un registro son rutas estáticas con el id en la query", () => {
    expect(rutas.cliente("abc")).toBe("/clientes/ver?id=abc");
    expect(rutas.contrataRecibo("c1")).toBe("/contratas/recibo?id=c1");
    expect(rutas.deudorEstadoCuenta("d1")).toBe("/deudores/estado-cuenta?id=d1");
  });

  it("agrega citaId solo cuando viene", () => {
    expect(rutas.contrataRenovar("c1", "cita-9")).toBe("/contratas/renovar?id=c1&citaId=cita-9");
    expect(rutas.contrataRenovar("c1", null)).toBe("/contratas/renovar?id=c1");
    expect(rutas.clienteUnificar("k1")).toBe("/clientes/unificar?id=k1");
  });

  it("codifica el id", () => {
    expect(rutas.cliente("a b&c")).toBe("/clientes/ver?id=a+b%26c");
  });

  it("toda ruta de detalle está entre las pantallas que se descargan para offline", () => {
    const rutasDeDetalle = Object.values(rutas).map((fn) => fn("x").split("?")[0]);
    for (const ruta of rutasDeDetalle) expect(PANTALLAS_OFFLINE).toContain(ruta);
  });
});
