import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Sesión caída" se mide desde la última desconexión, no desde la última
 * conexión. Caso real (Miguel, 20-nov): conectada desde hace 50 min, se cae
 * y la revisión de alertas pasa a los 5 s, mientras reconecta. Antes salía
 * "lleva más de 10 minutos caída".
 */
const { fake } = vi.hoisted(() => {
  const fake = {
    controlWhatsApp: { findUnique: vi.fn() },
    cuentaWhatsApp: { findMany: vi.fn() },
    bitacoraWhatsApp: { findMany: vi.fn(async () => []), groupBy: vi.fn() },
    mensajeWhatsApp: { groupBy: vi.fn(async () => []) },
    envioWhatsApp: { groupBy: vi.fn(async () => []) },
  };
  return { fake };
});
vi.mock("@/lib/prisma", () => ({ prisma: fake }));
vi.mock("@/lib/push", () => ({ enviarAUsuarios: vi.fn() }));

import { incidentesGraves } from "./alertas-push";

const ahora = new Date("2026-11-20T18:15:02Z");
const min = (n: number) => new Date(ahora.getTime() - n * 60_000);

function escenario(desconectadaHace: number) {
  fake.controlWhatsApp.findUnique.mockResolvedValue({ latidoEn: min(0.2) });
  const cuenta = {
    id: "k1",
    numero: "523131232974",
    estado: "DESCONECTADO",
    ultimaConexion: min(50),
    owner: { nombre: "Miguel", email: "x" },
    llaves: [{ cuentaId: "k1" }],
  };
  fake.cuentaWhatsApp.findMany.mockImplementation(async (args?: { where?: unknown }) =>
    args?.where ? [{ id: "k1" }] : [cuenta]
  );
  // 1.ª llamada: cierres de la última hora; 2.ª: última desconexión por cuenta.
  fake.bitacoraWhatsApp.groupBy
    .mockResolvedValueOnce([{ cuentaId: "k1", _count: { _all: 1 } }])
    .mockResolvedValueOnce([{ cuentaId: "k1", _max: { creadoEn: min(desconectadaHace) } }]);
}

describe("alerta de sesión caída", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no avisa si se desconectó hace segundos, aunque la última conexión sea de hace 50 min", async () => {
    escenario(5 / 60);
    const r = await incidentesGraves(ahora);
    expect(r.some((i) => i.clave.startsWith("sesion_caida"))).toBe(false);
  });

  it("avisa si de verdad lleva más de 10 minutos sin reconectar", async () => {
    escenario(12);
    const r = await incidentesGraves(ahora);
    expect(r.some((i) => i.clave.startsWith("sesion_caida"))).toBe(true);
  });
});
