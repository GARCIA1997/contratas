import { beforeEach, describe, expect, it, vi } from "vitest";

type B = { id: string; ownerId: string; clienteId: string; nombre: string; nombreNormalizado: string };
type C = { id: string; ownerId: string; clienteId: string; beneficiarioId: string | null };

const { bd, fake } = vi.hoisted(() => {
  const bd = { ben: [] as B[], con: [] as C[], clientes: [] as { id: string; nombre: string; telefono: string | null }[] };
  const coincide = (f: Record<string, unknown>, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) =>
      v && typeof v === "object" && "not" in (v as object) ? f[k] !== (v as { not: unknown }).not : f[k] === v
    );
  const fake = {
    beneficiario: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => bd.ben.find((b) => coincide(b, where)) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<B> }) => {
        const b = bd.ben.find((x) => x.id === where.id)!;
        Object.assign(b, data);
        return b;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        bd.ben = bd.ben.filter((b) => b.id !== where.id);
        return {};
      }),
    },
    contrata: {
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<C> }) => {
        const filas = bd.con.filter((c) => coincide(c, where));
        filas.forEach((c) => Object.assign(c, data));
        return { count: filas.length };
      }),
    },
    cliente: {
      create: vi.fn(async ({ data }: { data: { nombre: string; telefono: string | null } }) => {
        const c = { id: `cl${bd.clientes.length + 1}`, ...data };
        bd.clientes.push(c);
        return { id: c.id, nombre: c.nombre };
      }),
    },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(fake) : Promise.all(arg as Promise<unknown>[])
    ),
  };
  return { bd, fake };
});
vi.mock("@/lib/prisma", () => ({ prisma: fake }));

import { convertirEnCliente, renombrarBeneficiario, unirBeneficiarios } from "./beneficiarios";

beforeEach(() => {
  bd.ben = [
    { id: "alex", ownerId: "o", clienteId: "estela", nombre: "Alex", nombreNormalizado: "alex" },
    { id: "alejandro", ownerId: "o", clienteId: "estela", nombre: "Alejandro", nombreNormalizado: "alejandro" },
    { id: "otro", ownerId: "o", clienteId: "juan", nombre: "Lupe", nombreNormalizado: "lupe" },
  ];
  bd.con = [
    { id: "k1", ownerId: "o", clienteId: "estela", beneficiarioId: "alex" },
    { id: "k2", ownerId: "o", clienteId: "estela", beneficiarioId: "alejandro" },
    { id: "k3", ownerId: "o", clienteId: "estela", beneficiarioId: null },
  ];
  bd.clientes = [];
});

describe("administrar beneficiarios", () => {
  it("renombra y no deja chocar con otro del mismo cliente", async () => {
    await renombrarBeneficiario("o", "alex", "  Alexis  ");
    expect(bd.ben.find((b) => b.id === "alex")).toMatchObject({ nombre: "Alexis", nombreNormalizado: "alexis" });
    await expect(renombrarBeneficiario("o", "alex", "ALEJÁNDRO")).rejects.toThrow(/usa «Unir»/);
  });
  it("une duplicados: mueve sus contratas y borra el sobrante", async () => {
    const r = await unirBeneficiarios("o", "alex", "alejandro");
    expect(r.contratasMovidas).toBe(1);
    expect(bd.con.find((c) => c.id === "k1")?.beneficiarioId).toBe("alejandro");
    expect(bd.ben.some((b) => b.id === "alex")).toBe(false);
  });
  it("no une beneficiarios de clientes distintos", async () => {
    await expect(unirBeneficiarios("o", "alex", "otro")).rejects.toThrow(/mismo cliente/);
  });
  it("convierte en cliente: crea el cliente, le pasa sus contratas y no toca las demás", async () => {
    const r = await convertirEnCliente("o", "alejandro", "3121234567");
    expect(r.cliente.nombre).toBe("Alejandro");
    expect(bd.con.find((c) => c.id === "k2")).toMatchObject({ clienteId: r.cliente.id, beneficiarioId: null });
    expect(bd.con.find((c) => c.id === "k3")).toMatchObject({ clienteId: "estela" });
    expect(bd.ben.some((b) => b.id === "alejandro")).toBe(false);
  });
});
