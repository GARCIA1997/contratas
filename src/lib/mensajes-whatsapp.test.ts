import { describe, expect, it } from "vitest";
import {
  mensajeCobro,
  mensajeDetalleContrata,
  mensajeEntrega,
  mensajeEstadoCuenta,
  mensajeEstadoCuentaDeudor,
  mensajeRecordatorio,
} from "./mensajes-whatsapp";

const APP = "Kredired";
const FECHA = new Date(2026, 7, 24);

function pagos(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    numeroCuota: i + 1,
    fecha: new Date(2026, 8, 5 + i * 7),
  }));
}

/** Los seis mensajes, con datos mínimos — para las reglas que aplican a todos. */
const TODOS: [string, string][] = [
  [
    "cobro",
    mensajeCobro({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      total: 1500,
      fecha: FECHA,
      contratas: [
        {
          tipo: "SEMANAL",
          numCuotas: 10,
          montoContrata: 5000,
          saldoTrasCobro: 1500,
          subtotal: 1500,
          cuotas: [{ numeroCuota: 7, monto: 1500 }],
        },
      ],
    }),
  ],
  [
    "entrega",
    mensajeEntrega({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      tipo: "SEMANAL",
      monto: 5000,
      abono: 650,
      numCuotas: 10,
      pagos: pagos(10),
      fecha: FECHA,
    }),
  ],
  [
    "recordatorio",
    mensajeRecordatorio({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      total: 1500,
      diasAtrasoMax: 3,
    }),
  ],
  [
    "estado de cuenta",
    mensajeEstadoCuenta({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      capitalPrestado: 5000,
      totalAbonado: 3000,
      saldoPendiente: 2000,
      fecha: FECHA,
      contratas: [
        {
          tipo: "SEMANAL",
          montoContrata: 5000,
          cuotasPagadas: 6,
          numCuotas: 10,
          saldo: 2000,
          atrasada: false,
        },
      ],
    }),
  ],
  [
    "estado de cuenta de deudor",
    mensajeEstadoCuentaDeudor({
      nombreApp: APP,
      nombre: "Kenia Mora",
      deudaInicial: 8000,
      saldoActual: 5000,
      fecha: FECHA,
      abonos: [{ fecha: FECHA, monto: 3000, restante: 5000 }],
    }),
  ],
  [
    "detalle de contrata",
    mensajeDetalleContrata({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      tipo: "SEMANAL",
      monto: 5000,
      abono: 650,
      cuotasPagadas: 6,
      numCuotas: 10,
      saldo: 2600,
      atrasadas: [],
      incompletas: [],
      fecha: FECHA,
    }),
  ],
];

describe("identidad de marca (aplica a TODOS los mensajes)", () => {
  it.each(TODOS)("%s abre con la marca en mayúsculas", (_, texto) => {
    expect(texto.startsWith("🧾 *KREDIRED*")).toBe(true);
  });

  it.each(TODOS)("%s cierra firmado con la marca", (_, texto) => {
    expect(texto.trimEnd().endsWith("*KREDIRED*")).toBe(true);
  });

  it.each(TODOS)("%s nombra al cliente", (_, texto) => {
    expect(texto).toContain("Kenia Mora");
  });

  it.each(TODOS)("%s no deja líneas en blanco de más", (_, texto) => {
    expect(texto).not.toMatch(/\n{3,}/);
  });

  it("respeta un nombre de negocio distinto al de por defecto", () => {
    const texto = mensajeRecordatorio({
      nombreApp: "Préstamos Sol",
      clienteNombre: "Ana",
      total: 100,
      diasAtrasoMax: 0,
    });
    expect(texto.startsWith("🧾 *PRÉSTAMOS SOL*")).toBe(true);
    expect(texto.trimEnd().endsWith("*PRÉSTAMOS SOL*")).toBe(true);
  });
});

describe("mensajeCobro", () => {
  it("indica el saldo que queda tras el cobro", () => {
    const texto = mensajeCobro({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      total: 1500,
      contratas: [
        {
          tipo: "SEMANAL",
          numCuotas: 10,
          montoContrata: 5000,
          saldoTrasCobro: 1500,
          subtotal: 1500,
          cuotas: [{ numeroCuota: 7, monto: 1500 }],
        },
      ],
    });
    expect(texto).toContain("Cuota 7 de 10");
    expect(texto).toContain("Te resta por pagar");
  });

  it("celebra la contrata liquidada en vez de mostrar un saldo en cero", () => {
    const texto = mensajeCobro({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      total: 600,
      contratas: [
        {
          tipo: "QUINCENAL",
          numCuotas: 5,
          montoContrata: 2000,
          saldoTrasCobro: 0,
          subtotal: 600,
          cuotas: [{ numeroCuota: 5, monto: 600 }],
        },
      ],
    });
    expect(texto).toContain("¡Contrata liquidada!");
    expect(texto).not.toContain("Te resta por pagar");
  });

  // El recibo confirma, no regaña: si el cliente acaba de pagar, recordarle
  // que iba tarde convierte una buena noticia en un reclamo.
  it("nunca menciona atrasos", () => {
    const [, texto] = TODOS[0];
    expect(texto.toLowerCase()).not.toContain("atras");
    expect(texto.toLowerCase()).not.toContain("vencid");
  });
});

describe("mensajeEntrega — resumen del calendario", () => {
  it("con 10 pagos lista los 3 primeros, el hueco y el último", () => {
    const texto = mensajeEntrega({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      tipo: "SEMANAL",
      monto: 5000,
      abono: 650,
      numCuotas: 10,
      pagos: pagos(10),
      fecha: FECHA,
    });
    expect(texto).toContain("Pago 1 de 10");
    expect(texto).toContain("Pago 2 de 10");
    expect(texto).toContain("Pago 3 de 10");
    expect(texto).toContain("Pago 10 de 10");
    // Los 6 de en medio no se listan, pero se dice cuántos son.
    expect(texto).not.toContain("Pago 5 de 10");
    expect(texto).toContain("*6 pagos más*");
    expect(texto).toContain("tu primer pago");
    expect(texto).toContain("aquí queda liquidada");
  });

  it("con 4 pagos los lista todos, sin resumir", () => {
    const texto = mensajeEntrega({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      tipo: "SEMANAL",
      monto: 2000,
      abono: 550,
      numCuotas: 4,
      pagos: pagos(4),
      fecha: FECHA,
    });
    for (const n of [1, 2, 3, 4]) expect(texto).toContain(`Pago ${n} de 4`);
    expect(texto).not.toContain("pagos más");
  });

  it("con 5 pagos resume el único de en medio en singular", () => {
    const texto = mensajeEntrega({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      tipo: "SEMANAL",
      monto: 2000,
      abono: 550,
      numCuotas: 5,
      pagos: pagos(5),
      fecha: FECHA,
    });
    expect(texto).toContain("*1 pago más*");
    expect(texto).not.toContain("pagos más");
  });

  it("calcula el total a pagar como abono × número de pagos", () => {
    const texto = mensajeEntrega({
      nombreApp: APP,
      clienteNombre: "Kenia Mora",
      tipo: "SEMANAL",
      monto: 5000,
      abono: 650,
      numCuotas: 10,
      pagos: pagos(10),
      fecha: FECHA,
    });
    expect(texto).toContain("$6,500.00");
  });
});

describe("mensajeRecordatorio", () => {
  it("distingue vencido, hoy y por vencer", () => {
    const base = { nombreApp: APP, clienteNombre: "Ana", total: 500 };
    expect(mensajeRecordatorio({ ...base, diasAtrasoMax: 3 })).toContain(
      "vencido hace *3 días*"
    );
    expect(mensajeRecordatorio({ ...base, diasAtrasoMax: 0 })).toContain("Hoy vence tu pago");
    expect(mensajeRecordatorio({ ...base, diasAtrasoMax: -2 })).toContain(
      "vence en *2 días*"
    );
  });

  it("usa singular con un solo día", () => {
    const texto = mensajeRecordatorio({
      nombreApp: APP,
      clienteNombre: "Ana",
      total: 500,
      diasAtrasoMax: 1,
    });
    expect(texto).toContain("*1 día*");
    expect(texto).not.toContain("1 días");
  });

  it("deja salida al cliente que ya pagó", () => {
    const texto = mensajeRecordatorio({
      nombreApp: APP,
      clienteNombre: "Ana",
      total: 500,
      diasAtrasoMax: 5,
    });
    expect(texto).toContain("Si ya realizaste este pago, ignora este mensaje");
  });

  it("desglosa las cuotas pendientes cuando se le pasan", () => {
    const texto = mensajeRecordatorio({
      nombreApp: APP,
      clienteNombre: "Ana",
      total: 1500,
      diasAtrasoMax: 3,
      cuotas: [{ numeroCuota: 7, numCuotas: 10, pendiente: 1500, diasAtraso: 3 }],
    });
    expect(texto).toContain("Cuota 7 de 10");
    expect(texto).toContain("3 días de atraso");
  });
});

describe("mensajeEstadoCuenta", () => {
  it("marca las contratas atrasadas", () => {
    const texto = mensajeEstadoCuenta({
      nombreApp: APP,
      clienteNombre: "Ana",
      capitalPrestado: 5000,
      totalAbonado: 1000,
      saldoPendiente: 4000,
      contratas: [
        {
          tipo: "SEMANAL",
          montoContrata: 5000,
          cuotasPagadas: 2,
          numCuotas: 10,
          saldo: 4000,
          atrasada: true,
        },
      ],
    });
    expect(texto).toContain("atrasada");
    expect(texto).toContain("2 de 10 cuotas pagadas");
  });

  it("dice algo sensato cuando no hay contratas activas", () => {
    const texto = mensajeEstadoCuenta({
      nombreApp: APP,
      clienteNombre: "Ana",
      capitalPrestado: 0,
      totalAbonado: 0,
      saldoPendiente: 0,
      contratas: [],
    });
    expect(texto).toContain("No tienes contratas activas");
  });
});

describe("mensajeEstadoCuentaDeudor", () => {
  it("resume el historial largo dejando los 8 más recientes", () => {
    const abonos = Array.from({ length: 12 }, (_, i) => ({
      fecha: new Date(2026, 0, i + 1),
      monto: 100,
      restante: 1200 - (i + 1) * 100,
    }));
    const texto = mensajeEstadoCuentaDeudor({
      nombreApp: APP,
      nombre: "Ana",
      deudaInicial: 1200,
      saldoActual: 0,
      abonos,
    });
    expect(texto).toContain("y 4 abonos más");
  });

  it("celebra la deuda liquidada", () => {
    const texto = mensajeEstadoCuentaDeudor({
      nombreApp: APP,
      nombre: "Ana",
      deudaInicial: 1000,
      saldoActual: 0,
      abonos: [{ fecha: FECHA, monto: 1000, restante: 0 }],
    });
    expect(texto).toContain("¡DEUDA LIQUIDADA!");
  });

  it("calcula el abonado como deuda inicial menos saldo", () => {
    const texto = mensajeEstadoCuentaDeudor({
      nombreApp: APP,
      nombre: "Ana",
      deudaInicial: 8000,
      saldoActual: 5000,
      abonos: [],
    });
    expect(texto).toContain("Total abonado: $3,000.00");
  });
});

describe("mensajeDetalleContrata", () => {
  it("lista atrasadas e incompletas por separado", () => {
    const texto = mensajeDetalleContrata({
      nombreApp: APP,
      clienteNombre: "Ana",
      tipo: "SEMANAL",
      monto: 5000,
      abono: 650,
      cuotasPagadas: 4,
      numCuotas: 10,
      saldo: 3900,
      atrasadas: [{ numeroCuota: 5, fecha: FECHA }],
      incompletas: [{ numeroCuota: 6, montoAbonado: 200, faltante: 450 }],
      fecha: FECHA,
    });
    expect(texto).toContain("CUOTAS ATRASADAS");
    expect(texto).toContain("Cuota 5 de 10");
    expect(texto).toContain("CUOTAS INCOMPLETAS");
    expect(texto).toContain("falta *$450.00*");
  });

  it("omite las secciones vacías", () => {
    const [, texto] = TODOS[5];
    expect(texto).not.toContain("CUOTAS ATRASADAS");
    expect(texto).not.toContain("CUOTAS INCOMPLETAS");
  });
});

describe("las cifras del estado de cuenta cuadran a la vista", () => {
  // El cliente saca la calculadora justo aquí: si "total a pagar" menos
  // "abonado" no da el saldo, todo el documento pierde credibilidad.
  it("total a pagar − abonado = saldo pendiente", () => {
    const texto = mensajeEstadoCuenta({
      nombreApp: APP,
      clienteNombre: "Ana",
      capitalPrestado: 7000,
      totalAbonado: 3400,
      saldoPendiente: 4200,
      contratas: [],
    });
    expect(texto).toContain("Total a pagar: $7,600.00");
    expect(texto).toContain("Total abonado: $3,400.00");
    expect(texto).toContain("SALDO PENDIENTE: $4,200.00");
    // El capital sigue visible, pero como referencia aparte.
    expect(texto).toContain("de $7,000.00 que se te entregaron");
  });
});
