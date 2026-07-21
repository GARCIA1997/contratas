import { describe, expect, it } from "vitest";
import { alinearADiaCobro, anclarFechaCliente, calcularFechasPago } from "./fechas";

describe("anclarFechaCliente", () => {
  it("lee el año/mes/día en UTC y los reconstruye en hora local", () => {
    // Timestamp guardado a medianoche UTC (el caso típico de un <input
    // type=date> o de datos generados cuando el servidor corría en UTC).
    const fecha = anclarFechaCliente(new Date("2026-07-20T00:00:00.000Z"));
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(6); // julio
    expect(fecha.getDate()).toBe(20);
  });

  it("acepta un ISO string igual que un Date", () => {
    const fecha = anclarFechaCliente("2026-01-05T00:00:00.000Z");
    expect(fecha.getDate()).toBe(5);
    expect(fecha.getMonth()).toBe(0);
  });

  it("no se corre un día aunque el timestamp tenga horas distintas de medianoche", () => {
    // Ej. un dato generado en America/Mexico_City (UTC-6): 2026-07-20 06:00Z.
    const fecha = anclarFechaCliente(new Date("2026-07-20T06:00:00.000Z"));
    expect(fecha.getDate()).toBe(20);
  });
});

describe("alinearADiaCobro", () => {
  it("mueve la fecha al día de la semana configurado dentro de la misma semana", () => {
    // 2026-07-20 es lunes (día 1).
    const lunes = new Date(2026, 6, 20);
    const alSabado = alinearADiaCobro(lunes, 6);
    expect(alSabado.getDay()).toBe(6);
    expect(alSabado.getDate()).toBe(25); // sábado de esa misma semana
  });

  it("no mueve la fecha si ya cae en el día de cobro", () => {
    const lunes = new Date(2026, 6, 20);
    const resultado = alinearADiaCobro(lunes, 1);
    expect(resultado.getDate()).toBe(20);
  });
});

describe("calcularFechasPago", () => {
  it("SEMANAL: genera cuotas cada 7 días alineadas al día de cobro", () => {
    const fechas = calcularFechasPago("SEMANAL", "QUINCE_DIAS", new Date(2026, 6, 20), 4, 1);
    expect(fechas).toHaveLength(4);
    // Todas caen el mismo día de la semana.
    const dias = fechas.map((f) => f.getDay());
    expect(new Set(dias).size).toBe(1);
    expect(fechas[1].getTime() - fechas[0].getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("MENSUAL: la cuota 1 es la fecha de inicio, las siguientes suman meses", () => {
    const inicio = new Date(2026, 0, 31); // 31 de enero
    const fechas = calcularFechasPago("MENSUAL", "QUINCE_DIAS", inicio, 3, 1);
    expect(fechas[0].getDate()).toBe(31);
    expect(fechas[0].getMonth()).toBe(0);
    expect(fechas.length).toBe(3);
  });

  it("QUINCENAL modo QUINCE_DIAS: suma 15 días exactos entre cuotas", () => {
    const fechas = calcularFechasPago("QUINCENAL", "QUINCE_DIAS", new Date(2026, 6, 1), 3, 1);
    expect(fechas[0].getDate()).toBe(1);
    expect(fechas[1].getTime() - fechas[0].getTime()).toBe(15 * 24 * 60 * 60 * 1000);
  });

  it("QUINCENAL modo DIAS_1_Y_15: la cuota 1 es la fecha de inicio, las siguientes caen en día 1 o 15", () => {
    const fechas = calcularFechasPago("QUINCENAL", "DIAS_1_Y_15", new Date(2026, 6, 10), 4, 1);
    expect(fechas[0].getDate()).toBe(10);
    for (const f of fechas.slice(1)) {
      expect([1, 15]).toContain(f.getDate());
    }
  });

  it("QUINCENAL modo días 15 y último: la cuota 1 es la fecha de inicio literal", () => {
    const fechas = calcularFechasPago("QUINCENAL", "DIAS_15_Y_ULTIMO", new Date(2026, 6, 20), 3, 1);
    expect(fechas[0].getDate()).toBe(20);
  });
});
