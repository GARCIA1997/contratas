import { startOfDay, addDays } from "date-fns";
import type { TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { anclarFechaCliente } from "@/lib/fechas";
import { DIAS_PROXIMO_VENCIMIENTO } from "@/lib/contrata";
import { enTransaccion, prepararReciboCobro } from "@/lib/whatsapp-auto/recibos";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export type CuotaVencidaItem = {
  contrataId: string;
  pagoId: string;
  tipo: TipoContrata;
  numeroCuota: number;
  /** Total de cuotas de esa contrata — para mostrar "Cuota N/total" en el recibo. */
  numCuotas: number;
  fechaProgramada: string;
  pendiente: number;
};

export type PreviewCobroVencidas = {
  total: number;
  items: CuotaVencidaItem[];
};

/**
 * Todas las cuotas de las contratas activas de un cliente que ya vencieron
 * O que están "próximas" (mismo umbral que `estadoContrata` — hoy o hasta
 * `DIAS_PROXIMO_VENCIMIENTO` días adelante), y que no están del todo
 * pagadas. Incluye el saldo restante de cuotas con abono parcial. Se
 * incluyen las próximas a propósito: en campo, el cobrador suele cobrar por
 * adelantado cuando ya visitó al cliente por otra cuota vencida — separar
 * el pago en dos viajes no tiene sentido.
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
  const limite = addDays(base, DIAS_PROXIMO_VENCIMIENTO);
  const items: CuotaVencidaItem[] = [];

  for (const c of contratas) {
    for (const p of c.pagos) {
      if (p.pagado) continue;
      if (anclarFechaCliente(p.fechaProgramada) > limite) continue;
      const pendiente = round(c.abono - p.montoAbonado);
      if (pendiente <= 0) continue;
      items.push({
        contrataId: c.id,
        pagoId: p.id,
        tipo: c.tipo,
        numeroCuota: p.numeroCuota,
        numCuotas: c.pagos.length,
        fechaProgramada: p.fechaProgramada.toISOString(),
        pendiente,
      });
    }
  }

  const total = round(items.reduce((s, i) => s + i.pendiente, 0));
  return { total, items };
}

/**
 * Una cuota dentro de un recibo.
 *
 * `parcial` distingue "se pagó esta cuota" de "se abonó algo a esta cuota":
 * un abono parcial dejaba el mismo ✅ que un pago completo en el recibo de
 * WhatsApp, y el cliente entendía que su cuota ya estaba cubierta cuando no
 * lo estaba. Se omite (o va en false) cuando el pago sí cubrió la cuota,
 * que es el caso de todos los cobros de "Cobrar pendiente" y de Ruta.
 */
export type CuotaCobrada = {
  numeroCuota: number;
  /** Lo que se aplicó a esta cuota en este movimiento. */
  monto: number;
  /** true = el pago NO alcanzó a cubrir la cuota completa. */
  parcial?: boolean;
  /** Lo que le sigue faltando a esta cuota. Solo con `parcial`. */
  faltante?: number;
};

export type ContrataResumenCobro = {
  contrataId: string;
  tipo: TipoContrata;
  numCuotas: number;
  /** Capital prestado — el "de cuánto es la contrata". Opcional: no todos
   *  los llamadores tienen este dato a mano (p. ej. Ruta, que solo conoce
   *  la cuota suelta, no la contrata completa). */
  montoContrata?: number;
  cuotas: CuotaCobrada[];
  subtotal: number;
};

export type ResultadoCobroVencidas = {
  total: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  contratas: ContrataResumenCobro[];
};

/**
 * Junta las cuotas cobradas por contrata — el desglose que ve el cliente en
 * el recibo de WhatsApp. Puro y exportado a propósito: el espejo offline
 * (offline/repo.ts) arma los mismos `items` desde IndexedDB y reusa esta
 * función, para que un recibo hecho sin señal salga idéntico al que emite
 * el servidor.
 */
export function agruparCobroPorContrata(
  items: CuotaVencidaItem[]
): ContrataResumenCobro[] {
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
        numCuotas: i.numCuotas,
        cuotas: [{ numeroCuota: i.numeroCuota, monto: i.pendiente }],
        subtotal: i.pendiente,
      });
    }
  }
  return Array.from(porContrata.values());
}

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
    throw new HttpError(400, "No hay cuotas pendientes para cobrar");
  }

  const ahora = new Date();
  const total = round(items.reduce((s, i) => s + i.pendiente, 0));
  const contratas = agruparCobroPorContrata(items);
  const recibo = await prepararReciboCobro({
    ownerId,
    cliente,
    pagoIds: items.map((i) => i.pagoId),
    total,
    contratas,
  });
  await enTransaccion(
    items.map((i) =>
      prisma.pago.update({
        where: { id: i.pagoId },
        data: {
          montoAbonado: { increment: i.pendiente },
          pagado: true,
          fechaPago: ahora,
        },
      })
    ),
    recibo
  );

  return {
    total,
    clienteNombre: cliente.nombre,
    clienteTelefono: cliente.telefono,
    contratas,
  };
}
