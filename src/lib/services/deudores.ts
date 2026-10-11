import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import type { AbonoInput, DeudorInput } from "@/lib/validaciones";
import { guardarCobro, prepararReciboAbonoDeudor } from "@/lib/whatsapp-auto/recibos";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export type DeudorConAbonos = Prisma.DeudorGetPayload<{
  include: { abonos: true };
}>;

export type DeudorResumen = {
  id: string;
  nombre: string;
  telefono: string | null;
  deudaInicial: number;
  totalAbonado: number;
  saldoActual: number;
  numAbonos: number;
};

/** Saldo actual = deuda inicial - suma de abonos. */
export function saldoActual(deudor: DeudorConAbonos): number {
  const abonado = deudor.abonos.reduce((s, a) => s + a.monto, 0);
  return round(deudor.deudaInicial - abonado);
}

export async function listDeudores(ownerId: string): Promise<DeudorResumen[]> {
  const deudores = await prisma.deudor.findMany({
    where: { ownerId },
    include: { abonos: true },
    orderBy: { creadoEn: "desc" },
  });
  return deudores.map((d) => {
    const totalAbonado = round(d.abonos.reduce((s, a) => s + a.monto, 0));
    return {
      id: d.id,
      nombre: d.nombre,
      telefono: d.telefono,
      deudaInicial: d.deudaInicial,
      totalAbonado,
      saldoActual: round(d.deudaInicial - totalAbonado),
      numAbonos: d.abonos.length,
    };
  });
}

/** Suma de saldos vivos de todos los deudores del usuario. */
export async function deudaVivaGlobal(ownerId: string): Promise<number> {
  const resumenes = await listDeudores(ownerId);
  return round(resumenes.reduce((s, d) => s + d.saldoActual, 0));
}

export async function getDeudor(
  ownerId: string,
  id: string
): Promise<DeudorConAbonos> {
  const deudor = await prisma.deudor.findFirst({
    where: { id, ownerId },
    include: { abonos: { orderBy: { fecha: "asc" } } },
  });
  if (!deudor) throw new HttpError(404, "Deudor no encontrado");
  return deudor;
}

export async function crearDeudor(ownerId: string, input: DeudorInput) {
  // Ver crearCliente: un reintento con el mismo id devuelve el existente.
  if (input.id) {
    const previo = await prisma.deudor.findFirst({ where: { id: input.id, ownerId } });
    if (previo) return previo;
  }
  return prisma.deudor.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      ownerId,
      nombre: input.nombre,
      telefono: input.telefono || null,
      deudaInicial: input.deudaInicial,
      notas: input.notas ?? null,
    },
  });
}

export async function actualizarDeudor(
  ownerId: string,
  id: string,
  input: Partial<DeudorInput>
) {
  await getDeudor(ownerId, id);
  return prisma.deudor.update({
    where: { id },
    data: {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.telefono !== undefined ? { telefono: input.telefono || null } : {}),
      ...(input.deudaInicial !== undefined
        ? { deudaInicial: input.deudaInicial }
        : {}),
      ...(input.notas !== undefined ? { notas: input.notas } : {}),
    },
  });
}

export async function eliminarDeudor(ownerId: string, id: string) {
  await getDeudor(ownerId, id);
  await prisma.deudor.delete({ where: { id } });
}

/** Agrega un abono calculando el restante automáticamente. */
export async function agregarAbono(
  ownerId: string,
  deudorId: string,
  input: AbonoInput
): Promise<DeudorConAbonos> {
  const deudor = await getDeudor(ownerId, deudorId);
  const restante = round(saldoActual(deudor) - input.monto);

  const id = globalThis.crypto.randomUUID();
  const fecha = new Date(input.fecha);
  const recibo = await prepararReciboAbonoDeudor({
    ownerId,
    deudor,
    abonoId: id,
    monto: input.monto,
    restante,
    fecha,
  });
  await guardarCobro(
    () => [
      prisma.abonoDeudor.create({
        // El id solo se fija si hay recibo (lo necesita para referirlo); sin
        // WhatsApp automático el abono se crea exactamente como antes.
        data: { ...(recibo ? { id } : {}), deudorId, fecha, monto: input.monto, restante, notas: input.notas ?? null },
      }),
    ],
    recibo
  );
  return getDeudor(ownerId, deudorId);
}
