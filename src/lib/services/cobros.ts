import { startOfDay } from "date-fns";
import type { TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { anclarFechaCliente } from "@/lib/fechas";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export type CuotaVencidaItem = {
  contrataId: string;
  pagoId: string;
  tipo: TipoContrata;
  numeroCuota: number;
  fechaProgramada: string;
  pendiente: number;
};

export type PreviewCobroVencidas = {
  total: number;
  items: CuotaVencidaItem[];
};

/**
 * Todas las cuotas de las contratas activas de un cliente cuya fecha
 * programada ya llegó (hoy o antes) y que no están del todo pagadas.
 * Incluye el saldo restante de cuotas con abono parcial.
 */
export async function previewCobroVencidas(
  ownerId: string,
  clienteId: string,
  hoy: Date = new Date()
): Promise<PreviewCobroVencidas> {
  const contratas = await prisma.contrata.findMany({
    where: { ownerId, clienteId, convertidaADeuda: false },
    include: { pagos: true },
  });

  const base = startOfDay(hoy);
  const items: CuotaVencidaItem[] = [];

  for (const c of contratas) {
    for (const p of c.pagos) {
      if (p.pagado) continue;
      if (anclarFechaCliente(p.fechaProgramada) > base) continue;
      const pendiente = round(c.abono - p.montoAbonado);
      if (pendiente <= 0) continue;
      items.push({
        contrataId: c.id,
        pagoId: p.id,
        tipo: c.tipo,
        numeroCuota: p.numeroCuota,
        fechaProgramada: p.fechaProgramada.toISOString(),
        pendiente,
      });
    }
  }

  const total = round(items.reduce((s, i) => s + i.pendiente, 0));
  return { total, items };
}

export type ContrataResumenCobro = {
  contrataId: string;
  tipo: TipoContrata;
  cuotas: { numeroCuota: number; monto: number }[];
  subtotal: number;
};

export type ResultadoCobroVencidas = {
  total: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  contratas: ContrataResumenCobro[];
};

/**
 * Marca como pagadas (pago completo) todas las cuotas vencidas de las
 * contratas de un cliente, en una sola transacción.
 */
export async function ejecutarCobroVencidas(
  ownerId: string,
  clienteId: string,
  hoy: Date = new Date()
): Promise<ResultadoCobroVencidas> {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, ownerId },
    select: { id: true, nombre: true, telefono: true },
  });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");

  const { items } = await previewCobroVencidas(ownerId, clienteId, hoy);
  if (items.length === 0) {
    throw new HttpError(400, "No hay cuotas vencidas para cobrar");
  }

  const ahora = new Date();
  await prisma.$transaction(
    items.map((i) =>
      prisma.pago.update({
        where: { id: i.pagoId },
        data: {
          montoAbonado: { increment: i.pendiente },
          pagado: true,
          fechaPago: ahora,
        },
      })
    )
  );

  const porContrata = new Map<string, ContrataResumenCobro>();
  for (const i of items) {
    const actual = porContrata.get(i.contrataId);
    if (actual) {
      actual.cuotas.push({ numeroCuota: i.numeroCuota, monto: i.pendiente });
      actual.subtotal = round(actual.subtotal + i.pendiente);
    } else {
      porContrata.set(i.contrataId, {
        contrataId: i.contrataId,
        tipo: i.tipo,
        cuotas: [{ numeroCuota: i.numeroCuota, monto: i.pendiente }],
        subtotal: i.pendiente,
      });
    }
  }

  return {
    total: round(items.reduce((s, i) => s + i.pendiente, 0)),
    clienteNombre: cliente.nombre,
    clienteTelefono: cliente.telefono,
    contratas: Array.from(porContrata.values()),
  };
}
