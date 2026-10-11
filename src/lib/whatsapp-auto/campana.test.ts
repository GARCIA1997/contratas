import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BD en memoria con lo que importa aquí: `claveDedupe` es ÚNICA en
 * MensajeWhatsApp y `createMany({ skipDuplicates })` omite en silencio lo
 * que choca — justo lo que dejaba las campañas repetidas sin mensajes.
 */
type Mensaje = {
  id: string;
  cuentaId: string;
  tipo: string;
  estado: string;
  claveDedupe: string;
  campanaId: string | null;
  telefono: string;
  orden: number | null;
  motivo: string | null;
  [k: string]: unknown;
};
type Campana = { id: string; cuentaId: string; estado: string; total: number; pausaMotivo: string | null; [k: string]: unknown };

const { bd, fake } = vi.hoisted(() => {
const bd = { mensajes: [] as Mensaje[], campanas: [] as Campana[], bitacora: [] as { tipo: string; detalle: unknown }[] };
  let seq = 0;
  const nuevoId = () => `id${++seq}`;
  
  function coincide(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "in" in (v as object)) return ((v as { in: unknown[] }).in).includes(fila[k]);
      return fila[k] === v;
    });
  }
  
  const fake = {
    campanaWhatsApp: {
      create: async ({ data }: { data: Partial<Campana> }) => {
        const c = { id: nuevoId(), estado: "ACTIVA", pausaMotivo: null, ...data } as Campana;
        bd.campanas.push(c);
        return c;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Campana> }) => {
        const c = bd.campanas.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => bd.campanas.find((x) => x.id === where.id)!,
    },
    mensajeWhatsApp: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => bd.mensajes.filter((m) => coincide(m, where)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Mensaje> }) => {
        const m = bd.mensajes.find((x) => x.id === where.id)!;
        Object.assign(m, data);
        return m;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Mensaje> }) => {
        const filas = bd.mensajes.filter((m) => coincide(m, where));
        filas.forEach((m) => Object.assign(m, data));
        return { count: filas.length };
      },
      createMany: async ({ data, skipDuplicates }: { data: Partial<Mensaje>[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const d of data) {
          if (bd.mensajes.some((m) => m.claveDedupe === d.claveDedupe)) {
            if (skipDuplicates) continue;
            throw new Error("Unique constraint failed on claveDedupe");
          }
          bd.mensajes.push({ id: nuevoId(), estado: "PENDIENTE", motivo: null, ...d } as Mensaje);
          count++;
        }
        return { count };
      },
    },
    bitacoraWhatsApp: {
      create: async ({ data }: { data: { tipo: string; detalle: unknown } }) => {
        bd.bitacora.push({ tipo: data.tipo, detalle: data.detalle });
        return data;
      },
    },
    $transaction: async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(fake) : Promise.all(arg as Promise<unknown>[]),
  };
  return { bd, fake };
});

vi.mock("@/lib/prisma", () => ({ prisma: fake }));

import { cambiarEstadoCampana, encolarCampana, type DestinatarioPresentacion } from "./admin";

const CUENTA = "cuenta-1";
const lista: DestinatarioPresentacion[] = Array.from({ length: 13 }, (_, i) => ({
  telefono: `52312000${String(i).padStart(4, "0")}`,
  nombre: `Cliente ${i}`,
  clienteId: `cli-${i}`,
  ultimoPago: null,
}));
const iniciar = () => encolarCampana({ cuentaId: CUENTA, ownerId: "owner-1", lista, actor: "test" });
const pendientesDe = (campanaId: string) => bd.mensajes.filter((m) => m.campanaId === campanaId && m.estado === "PENDIENTE");

beforeEach(() => {
  bd.mensajes = [];
  bd.campanas = [];
  bd.bitacora = [];
});

describe("campaña de presentación repetida", () => {
  it("terminar una campaña y crear otra con los mismos destinatarios encola los N mensajes", async () => {
    const primera = await iniciar();
    expect(pendientesDe(primera.campanaId)).toHaveLength(13);

    await cambiarEstadoCampana(primera.campanaId, "terminar", "test");
    expect(bd.mensajes.every((m) => m.estado === "CANCELADO")).toBe(true);

    const segunda = await iniciar();
    expect(segunda.estado).toBe("ACTIVA");
    expect(segunda.reactivados).toBe(13);
    expect(pendientesDe(segunda.campanaId)).toHaveLength(13);
    expect(bd.campanas.find((c) => c.id === segunda.campanaId)?.estado).toBe("ACTIVA");
    expect(bd.mensajes).toHaveLength(13); // reutilizados, no duplicados
  });

  it("no reactiva los ENVIADO, ENVIANDO, REVISAR ni FALLIDO", async () => {
    const primera = await iniciar();
    await cambiarEstadoCampana(primera.campanaId, "terminar", "test");
    const [a, b, c, d] = bd.mensajes;
    a.estado = "ENVIADO";
    b.estado = "ENVIANDO";
    c.estado = "REVISAR";
    d.estado = "FALLIDO";

    const segunda = await iniciar();
    expect(segunda.reactivados).toBe(9);
    expect(segunda.omitidos).toHaveLength(4);
    expect([a.estado, b.estado, c.estado, d.estado]).toEqual(["ENVIADO", "ENVIANDO", "REVISAR", "FALLIDO"]);
    expect(a.campanaId).toBe(primera.campanaId);
    expect(pendientesDe(segunda.campanaId)).toHaveLength(9);
    // El total refleja lo que de verdad quedó en la cola.
    expect(bd.campanas.find((x) => x.id === segunda.campanaId)?.total).toBe(9);
  });

  it("con destinatarios pero sin mensajes encolados queda en ERROR (no TERMINADA) y en la bitácora", async () => {
    const primera = await iniciar();
    bd.mensajes.forEach((m) => (m.estado = "ENVIADO"));
    void primera;

    await expect(iniciar()).rejects.toMatchObject({ status: 409 });
    const segunda = bd.campanas[bd.campanas.length - 1];
    expect(segunda.estado).toBe("ERROR");
    expect(segunda.estado).not.toBe("TERMINADA");
    expect(segunda.pausaMotivo).toMatch(/no se encoló ningún mensaje/);
    const alerta = bd.bitacora.find((b) => b.tipo === "alerta_campana_sin_mensajes");
    expect(alerta?.detalle).toMatchObject({ destinatarios: 13, encolados: 0, omitidos: 13 });
  });
});
