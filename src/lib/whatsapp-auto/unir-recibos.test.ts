import { describe, expect, it } from "vitest";
import { unirRecibos } from "./unir-recibos";
import { esTransaccional, enHorario, recibosListosEn, VENTANA_SINCRONIZACION_MS } from "./reglas";

const uno = (monto: number, cuota: number, abono: number, contrataId = `c${monto}`) => ({
  total: abono,
  contratas: [
    {
      contrataId,
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
  it("no mezcla dos contratas distintas aunque sean idénticas en monto y cuotas", () => {
    const t = unirRecibos({ nombreApp: "K", clienteNombre: "A", datos: [uno(7000, 5, 875, "a"), uno(7000, 6, 875, "b")] })!;
    expect(t.match(/préstamo de/g)).toHaveLength(2);
    expect(t.match(/Te resta por pagar/g)).toHaveLength(2);
  });
  it("cada contrata lleva su saldo y se suma el total de todas", () => {
    const t = unirRecibos({ nombreApp: "K", clienteNombre: "A", datos: [uno(7000, 6, 875), uno(10000, 4, 1250)] })!;
    expect(t).toContain("Te resta por pagar: *$1,750.00*");
    expect(t).toContain("Te resta por pagar: *$5,000.00*");
    expect(t).toContain("Saldo total de estas 2 contratas: $6,750.00");
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

describe("recibosListosEn (un solo recibo aunque se sincronice lento)", () => {
  const t0 = new Date("2026-10-15T18:00:00Z").getTime();
  const r = (tel: string, creadoS: number, programadoS = creadoS) => ({
    telefono: tel,
    creadoEn: new Date(t0 + creadoS * 1000),
    programadoPara: new Date(t0 + programadoS * 1000),
  });
  it("con señal: 5 s después del último recibo del teléfono", () => {
    expect(recibosListosEn([r("a", 0), r("a", 0.2)]).get("a")).toBe(t0 + 5200);
  });
  it("sincronizado lento: cada operación que llega reinicia la espera de 30 s", () => {
    const v = VENTANA_SINCRONIZACION_MS / 1000;
    const listos = recibosListosEn([r("a", 0, v), r("a", 12, 12 + v), r("b", 0)]);
    expect(listos.get("a")).toBe(t0 + (12 + v) * 1000);
    expect(listos.get("b")).toBe(t0 + 5000);
  });
});
