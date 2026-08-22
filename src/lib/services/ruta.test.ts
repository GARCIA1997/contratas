import { describe, expect, it } from "vitest";
import { aggregarRutaDelDia, type ClienteParaRuta } from "./ruta";

function cliente(overrides: Partial<ClienteParaRuta> = {}): ClienteParaRuta {
  return {
    id: "cli-1",
    nombre: "Juan",
    telefono: null,
    direccion: null,
    contratas: [],
    ...overrides,
  };
}

// Jueves — para tener margen de sobra hacia atrás y hacia adelante.
const HOY = new Date(2026, 6, 30);

describe("aggregarRutaDelDia — ventana de anticipación", () => {
  it("incluye una cuota que vence hoy con diasAtraso 0", () => {
    const c = cliente({
      contratas: [
        {
          id: "k1",
          abono: 500,
          convertidaADeuda: false,
        monto: 1000,
        tipo: "SEMANAL" as const,
          pagos: [
            { numeroCuota: 1, fechaProgramada: HOY, pagado: false, montoAbonado: 0 },
          ],
        },
      ],
    });
    const paradas = aggregarRutaDelDia([c], HOY);
    expect(paradas).toHaveLength(1);
    expect(paradas[0].diasAtrasoMax).toBe(0);
  });

  it("incluye una cuota vencida hace 3 días con diasAtraso positivo", () => {
    const c = cliente({
      contratas: [
        {
          id: "k1",
          abono: 500,
          convertidaADeuda: false,
        monto: 1000,
        tipo: "SEMANAL" as const,
          pagos: [
            {
              numeroCuota: 1,
              fechaProgramada: new Date(2026, 6, 27),
              pagado: false,
              montoAbonado: 0,
            },
          ],
        },
      ],
    });
    const paradas = aggregarRutaDelDia([c], HOY);
    expect(paradas).toHaveLength(1);
    expect(paradas[0].diasAtrasoMax).toBe(3);
  });

  it("incluye una cuota que vence en 2 días (pedido: aparecer con anticipación)", () => {
    const c = cliente({
      contratas: [
        {
          id: "k1",
          abono: 500,
          convertidaADeuda: false,
        monto: 1000,
        tipo: "SEMANAL" as const,
          pagos: [
            {
              numeroCuota: 1,
              fechaProgramada: new Date(2026, 7, 1),
              pagado: false,
              montoAbonado: 0,
            },
          ],
        },
      ],
    });
    const paradas = aggregarRutaDelDia([c], HOY);
    expect(paradas).toHaveLength(1);
    expect(paradas[0].diasAtrasoMax).toBe(-2);
  });

  it("NO incluye una cuota que vence en 3 días (fuera de la ventana)", () => {
    const c = cliente({
      contratas: [
        {
          id: "k1",
          abono: 500,
          convertidaADeuda: false,
        monto: 1000,
        tipo: "SEMANAL" as const,
          pagos: [
            {
              numeroCuota: 1,
              fechaProgramada: new Date(2026, 7, 2),
              pagado: false,
              montoAbonado: 0,
            },
          ],
        },
      ],
    });
    expect(aggregarRutaDelDia([c], HOY)).toHaveLength(0);
  });

  it("no incluye cuotas ya pagadas ni contratas convertidas a deuda", () => {
    const c = cliente({
      contratas: [
        {
          id: "k1",
          abono: 500,
          convertidaADeuda: false,
        monto: 1000,
        tipo: "SEMANAL" as const,
          pagos: [
            { numeroCuota: 1, fechaProgramada: HOY, pagado: true, montoAbonado: 500 },
          ],
        },
        {
          id: "k2",
          abono: 500,
          convertidaADeuda: true,
        monto: 1000,
        tipo: "SEMANAL" as const,
          pagos: [
            { numeroCuota: 1, fechaProgramada: HOY, pagado: false, montoAbonado: 0 },
          ],
        },
      ],
    });
    expect(aggregarRutaDelDia([c], HOY)).toHaveLength(0);
  });
});
