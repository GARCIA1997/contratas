import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolverBeneficiario } from "./contratas";
import { mensajeCobro, mensajeEntrega, mensajeRecordatorio } from "@/lib/mensajes-whatsapp";

type Fila = { id: string; ownerId: string; clienteId: string; nombre: string; nombreNormalizado: string };

function txFalso(filas: Fila[]) {
  return {
    beneficiario: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const or = (where.OR as Record<string, string>[] | undefined) ?? [];
        return (
          filas.find(
            (f) =>
              f.ownerId === where.ownerId &&
              f.clienteId === where.clienteId &&
              (where.id ? f.id === where.id : true) &&
              (or.length === 0 || or.some((c) => (c.id ? f.id === c.id : f.nombreNormalizado === c.nombreNormalizado)))
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Fila }) => {
        filas.push(data);
        return { id: data.id };
      }),
    },
  } as never;
}

const ID = "11111111-1111-4111-8111-111111111111";

describe("resolverBeneficiario", () => {
  it("sin beneficiario la contrata es del cliente (null)", async () => {
    expect(await resolverBeneficiario(txFalso([]), "o", "c", {})).toBeNull();
  });
  it("crea el nuevo con el id del teléfono y nombre limpio", async () => {
    const filas: Fila[] = [];
    const id = await resolverBeneficiario(txFalso(filas), "o", "c", { beneficiarioNuevo: { id: ID, nombre: "  Alejandro   Pérez " } });
    expect(id).toBe(ID);
    expect(filas[0]).toMatchObject({ nombre: "Alejandro Pérez", nombreNormalizado: "alejandro perez" });
  });
  it("reutiliza el existente con el mismo nombre normalizado (dos teléfonos sin señal)", async () => {
    const filas: Fila[] = [{ id: "b1", ownerId: "o", clienteId: "c", nombre: "Alejandro", nombreNormalizado: "alejandro" }];
    const tx = txFalso(filas);
    expect(await resolverBeneficiario(tx, "o", "c", { beneficiarioNuevo: { id: ID, nombre: "ALEJÁNDRO" } })).toBe("b1");
    expect(filas).toHaveLength(1);
  });
  it("rechaza un beneficiario de otro cliente", async () => {
    const filas: Fila[] = [{ id: "b1", ownerId: "o", clienteId: "otro", nombre: "Lupe", nombreNormalizado: "lupe" }];
    await expect(resolverBeneficiario(txFalso(filas), "o", "c", { beneficiarioId: "b1" })).rejects.toThrow(/no es de este cliente/);
  });
});

describe("mensajes con beneficiario", () => {
  it("el recibo dice de quién es cada contrata", () => {
    const t = mensajeCobro({
      nombreApp: "K",
      clienteNombre: "Estela",
      total: 450,
      contratas: [
        { tipo: "SEMANAL", numCuotas: 10, montoContrata: 5000, beneficiario: "Alejandro", cuotas: [{ numeroCuota: 3, monto: 450 }], subtotal: 450 },
      ],
    });
    expect(t).toContain("🔹 *Semanal* · préstamo de $5,000.00 · de Alejandro");
    expect(t).toContain("👤 *Estela*");
  });
  it("sin beneficiario el recibo queda como siempre", () => {
    const t = mensajeCobro({ nombreApp: "K", clienteNombre: "E", total: 1, contratas: [{ tipo: "SEMANAL", numCuotas: 1, montoContrata: 1, cuotas: [{ numeroCuota: 1, monto: 1 }], subtotal: 1 }] });
    expect(t).not.toContain(" · de ");
  });
  it("el comprobante de entrega y el recordatorio también lo nombran", () => {
    expect(
      mensajeEntrega({ nombreApp: "K", clienteNombre: "Estela", beneficiario: "Lupe", tipo: "SEMANAL", monto: 1000, abono: 130, numCuotas: 10, pagos: [] })
    ).toContain("👥 A nombre de: *Lupe*");
    expect(
      mensajeRecordatorio({
        nombreApp: "K",
        clienteNombre: "Estela",
        total: 450,
        diasAtrasoMax: 0,
        cuotas: [{ numeroCuota: 3, numCuotas: 10, pendiente: 450, diasAtraso: 0, beneficiario: "Alejandro" }],
      })
    ).toContain("Cuota 3 de 10 (Alejandro)");
  });
});
