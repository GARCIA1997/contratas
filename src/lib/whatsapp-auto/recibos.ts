import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mensajeCobro, mensajeReciboAbonoDeudor, type CobroContrata } from "@/lib/mensajes-whatsapp";
import { claveOperacionActual } from "./contexto-operacion";
import { normalizarTelefono } from "./telefono";
import { PRIORIDAD } from "./reglas";

/**
 * Recibo automático: se genera EN LA MISMA TRANSACCIÓN que aplica el cobro
 * (outbox transaccional). Si el cobro no llega a la BD —la cola offline lo
 * rechazó o el usuario lo descartó— el recibo tampoco existe, sin lógica
 * extra. El envío lo hace el worker (worker/whatsapp), nunca la petición.
 *
 * Cada `preparar*` devuelve la escritura para meterla en el `$transaction`
 * del servicio, o null si ese espacio no tiene recibos automáticos.
 */

type Escritura = Prisma.PrismaPromise<unknown>;
/**
 * Envuelto en un objeto a propósito: un PrismaPromise es "thenable", así que
 * devolverlo directo desde una función async lo EJECUTARÍA al resolverse —
 * fuera de la transacción del cobro.
 */
export type ReciboPreparado = { escritura: Escritura };

type Destinatario =
  | { clienteId: string; deudorId?: undefined; nombre: string; telefono: string | null }
  | { deudorId: string; clienteId?: undefined; nombre: string; telefono: string | null };

async function cuentaConRecibos(ownerId: string) {
  const cuenta = await prisma.cuentaWhatsApp.findUnique({
    where: { ownerId },
    select: { id: true, ownerId: true, activo: true, recibos: true },
  });
  return cuenta?.activo && cuenta.recibos ? cuenta : null;
}

async function nombreAppDe(ownerId: string): Promise<string> {
  const conf = await prisma.configuracion.findUnique({ where: { ownerId }, select: { nombreApp: true } });
  return conf?.nombreApp ?? "Kredired";
}

async function prepararRecibo(opts: {
  ownerId: string;
  destinatario: Destinatario;
  pagoIds?: string[];
  abonoDeudorId?: string;
  texto: (nombreApp: string) => string;
}): Promise<ReciboPreparado | null> {
  const telefono = normalizarTelefono(opts.destinatario.telefono);
  if (!telefono) return null;
  const cuenta = await cuentaConRecibos(opts.ownerId);
  if (!cuenta) return null;
  const optOut = await prisma.optOutWhatsApp.findUnique({
    where: { cuentaId_telefono: { cuentaId: cuenta.id, telefono } },
    select: { activo: true },
  });
  if (optOut?.activo) return null;

  const texto = opts.texto(await nombreAppDe(opts.ownerId));
  // Sin Idempotency-Key (petición directa sin cola) no hay reintento que
  // deduplicar: basta una clave única.
  const clave = claveOperacionActual() ?? globalThis.crypto.randomUUID();
  const escritura = prisma.mensajeWhatsApp.createMany({
    data: [
      {
        cuentaId: cuenta.id,
        ownerId: cuenta.ownerId,
        tipo: "RECIBO",
        prioridad: PRIORIDAD.RECIBO,
        telefono,
        destinatarioNombre: opts.destinatario.nombre,
        clienteId: opts.destinatario.clienteId ?? null,
        deudorId: opts.destinatario.deudorId ?? null,
        pagoIds: opts.pagoIds ?? [],
        abonoDeudorId: opts.abonoDeudorId ?? null,
        claveDedupe: `recibo:${clave}`,
        texto,
      },
    ],
    skipDuplicates: true,
  });
  return { escritura };
}

export function prepararReciboCobro(opts: {
  ownerId: string;
  cliente: { id: string; nombre: string; telefono: string | null };
  pagoIds: string[];
  total: number;
  contratas: CobroContrata[];
}): Promise<ReciboPreparado | null> {
  return prepararRecibo({
    ownerId: opts.ownerId,
    destinatario: { clienteId: opts.cliente.id, nombre: opts.cliente.nombre, telefono: opts.cliente.telefono },
    pagoIds: opts.pagoIds,
    texto: (nombreApp) =>
      mensajeCobro({
        nombreApp,
        clienteNombre: opts.cliente.nombre,
        total: opts.total,
        contratas: opts.contratas,
      }),
  });
}

export function prepararReciboAbonoDeudor(opts: {
  ownerId: string;
  deudor: { id: string; nombre: string; telefono: string | null };
  abonoId: string;
  monto: number;
  restante: number;
  fecha: Date;
}): Promise<ReciboPreparado | null> {
  return prepararRecibo({
    ownerId: opts.ownerId,
    destinatario: { deudorId: opts.deudor.id, nombre: opts.deudor.nombre, telefono: opts.deudor.telefono },
    abonoDeudorId: opts.abonoId,
    texto: (nombreApp) =>
      mensajeReciboAbonoDeudor({
        nombreApp,
        nombre: opts.deudor.nombre,
        monto: opts.monto,
        restante: opts.restante,
        fecha: opts.fecha,
      }),
  });
}

/**
 * El cobro de estas cuotas se revirtió (desmarcar / limpiar). El recibo que
 * no ha salido se cancela; el que ya salió se marca para atenderlo a mano
 * desde el monitor (no se manda corrección automática).
 */
export function revertirRecibos(ownerId: string, pagoIds: string[]): Escritura[] {
  return [
    prisma.mensajeWhatsApp.updateMany({
      where: { ownerId, tipo: "RECIBO", estado: "PENDIENTE", pagoIds: { hasSome: pagoIds } },
      data: { estado: "CANCELADO", motivo: "Cobro revertido antes de enviarse" },
    }),
    prisma.mensajeWhatsApp.updateMany({
      where: { ownerId, tipo: "RECIBO", estado: { in: ["ENVIANDO", "ENVIADO", "REVISAR"] }, pagoIds: { hasSome: pagoIds } },
      data: { revertido: true },
    }),
  ];
}

/** Las escrituras del cobro + su recibo, todo o nada. */
export function enTransaccion(escrituras: Escritura[], recibo: ReciboPreparado | null) {
  return prisma.$transaction(recibo ? [...escrituras, recibo.escritura] : escrituras);
}

/** Recibo de una cuota de una contrata, con el saldo que queda tras el cobro. */
export function cobroDeContrata(
  contrata: {
    tipo: CobroContrata["tipo"];
    monto: number;
    abono: number;
    pagos: { numeroCuota: number; montoAbonado: number }[];
  },
  aplicaciones: { numeroCuota: number; monto: number; quedaPagada: boolean }[]
): CobroContrata {
  const r = (n: number) => Math.round(n * 100) / 100;
  const extra = new Map(aplicaciones.map((a) => [a.numeroCuota, a.monto]));
  const saldo = contrata.pagos.reduce(
    (s, p) => s + Math.max(0, contrata.abono - (p.montoAbonado + (extra.get(p.numeroCuota) ?? 0))),
    0
  );
  return {
    tipo: contrata.tipo,
    numCuotas: contrata.pagos.length,
    montoContrata: contrata.monto,
    saldoTrasCobro: r(saldo),
    cuotas: aplicaciones.map((a) => {
      const p = contrata.pagos.find((x) => x.numeroCuota === a.numeroCuota);
      const faltante = r(contrata.abono - ((p?.montoAbonado ?? 0) + a.monto));
      return a.quedaPagada
        ? { numeroCuota: a.numeroCuota, monto: r(a.monto) }
        : { numeroCuota: a.numeroCuota, monto: r(a.monto), parcial: true, faltante: Math.max(0, faltante) };
    }),
    subtotal: r(aplicaciones.reduce((s, a) => s + a.monto, 0)),
  };
}
