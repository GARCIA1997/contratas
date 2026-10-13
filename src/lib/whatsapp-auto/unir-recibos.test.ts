import { describe, expect, it } from "vitest";
import { unirRecibos } from "./unir-recibos";
import { esTransaccional, enHorario } from "./reglas";

const uno = (monto: number, cuota: number, abono: number) => ({
  total: abono,
  contratas: [
    {
      numCuotas: 10,
      montoContrata: monto,
      saldoTrasCobro: monto - abono * cuota,
      cuotas: [{ numeroCuota: cuota, monto: abono }],
      subtotal: abono,
    },
  ],
});

describe("unirRecibos", () => {
  it("junta dos contratas en un solo comprobante con un solo total", () => {
    const t = unirRecibos({
      nombreApp: "Kredired",
      clienteNombre: "Kenia",
      datos: [uno(7000, 6, 875), uno(10000, 4, 1250)],
    });
    expect(t).not.toBeNull();
    expect(t!.match(/TOTAL COBRADO/g)).toHaveLength(1);
    expect(t).toContain("$2,125.00");
    expect(t).toContain("préstamo de $7,000.00");
    expect(t).toContain("préstamo de $10,000.00");
  });
  it("une cuotas de la misma contrata en un bloque", () => {
    const t = unirRecibos({ nombreApp: "K", clienteNombre: "A", datos: [uno(7000, 5, 875), uno(7000, 6, 875)] })!;
    expect(t.match(/préstamo de/g)).toHaveLength(1);
    expect(t).toContain("Cuota 5 de 10");
    expect(t).toContain("Cuota 6 de 10");
  });
  it("devuelve null si algún recibo no trae datos", () => {
    expect(unirRecibos({ nombreApp: "K", clienteNombre: "A", datos: [uno(7000, 5, 875), null] })).toBeNull();
  });
});

describe("mensajes de prueba", () => {
  it("salen a cualquier hora (transaccionales) mientras los recordatorios respetan el horario", () => {
    expect(esTransaccional("PRUEBA")).toBe(true);
    expect(esTransaccional("VENCIDA")).toBe(false);
    expect(enHorario(new Date(2026, 9, 13, 22))).toBe(false);
  });
});
