import type { Prisma, TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import type { ClienteInput } from "@/lib/validaciones";
import {
  estadoContrata,
  saldoPendiente,
  calcularScorePago,
  construirHistorial,
  type EstadoContrata,
  type ResultadoScorePago,
  type EventoHistorial,
} from "@/lib/contrata";

export type ClienteConConteo = Prisma.ClienteGetPayload<{
  include: { _count: { select: { contratas: true } } };
}>;

export async function listClientes(ownerId: string): Promise<ClienteConConteo[]> {
  return prisma.cliente.findMany({
    where: { ownerId },
    include: { _count: { select: { contratas: true } } },
    orderBy: { nombre: "asc" },
  });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** La fecha de pago más reciente entre cuotas ya pagadas, o `null` si ninguna. */
function ultimaFechaPago(pagos: { pagado: boolean; fechaPago: Date | null }[]): string | null {
  const fechas = pagos
    .filter((p) => p.pagado && p.fechaPago)
    .map((p) => p.fechaPago as Date);
  if (fechas.length === 0) return null;
  return new Date(Math.max(...fechas.map((f) => f.getTime()))).toISOString();
}

export type ContrataDeCliente = {
  id: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  pagados: number;
  total: number;
  saldo: number;
  estado: EstadoContrata;
  creadoEn: string;
  /** Fecha del último pago registrado (la más reciente entre sus cuotas
   * pagadas) — para ordenar "Pagadas" por cuándo terminó de liquidarse, no
   * por cuándo se creó la contrata (pueden no coincidir). `null` si ninguna
   * cuota tiene pago registrado todavía. */
  ultimaFechaPago: string | null;
};

export type ClientePerfil = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
  notas: string | null;
  contratas: ContrataDeCliente[];
  totales: {
    capitalPrestado: number;
    contratasActivas: number;
    contratasLiquidadas: number;
    saldoPendiente: number;
  };
  /** Puntualidad histórica, cruzando todas sus contratas (activas o no). */
  scorePago: ResultadoScorePago;
};

/** Perfil consolidado del cliente: historial de contratas + totales. */
export async function getClientePerfil(
  ownerId: string,
  id: string
): Promise<ClientePerfil> {
  const cliente = await prisma.cliente.findFirst({
    where: { id, ownerId },
    include: {
      contratas: {
        include: { pagos: true },
        orderBy: { creadoEn: "desc" },
      },
    },
  });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");

  const contratas: ContrataDeCliente[] = cliente.contratas.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    monto: c.monto,
    abono: c.abono,
    pagados: c.pagos.filter((p) => p.pagado).length,
    total: c.pagos.length,
    saldo: c.convertidaADeuda ? 0 : saldoPendiente(c.pagos, c.abono),
    estado: c.convertidaADeuda ? "EN_DEUDA" : estadoContrata(c.pagos),
    creadoEn: c.creadoEn.toISOString(),
    ultimaFechaPago: ultimaFechaPago(c.pagos),
  }));

  // "Activas" y el saldo pendiente del perfil excluyen las contratas ya
  // convertidas a deuda: su saldo se sigue en /deudores, no aquí.
  const contratasParaTotales = contratas.filter((c) => c.estado !== "EN_DEUDA");
  const totales = {
    capitalPrestado: round(contratas.reduce((s, c) => s + c.monto, 0)),
    contratasActivas: contratasParaTotales.filter(
      (c) => c.estado !== "LIQUIDADA"
    ).length,
    contratasLiquidadas: contratasParaTotales.filter(
      (c) => c.estado === "LIQUIDADA"
    ).length,
    saldoPendiente: round(
      contratasParaTotales.reduce((s, c) => s + c.saldo, 0)
    ),
  };

  // El score cruza los pagos de TODAS sus contratas (el comportamiento
  // pasado es la señal, sin importar si esa contrata en particular ya
  // terminó o se convirtió a deuda).
  const todosLosPagos = cliente.contratas.flatMap((c) => c.pagos);
  const scorePago = calcularScorePago(todosLosPagos);

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    direccion: cliente.direccion,
    referencia: cliente.referencia,
    notas: cliente.notas,
    contratas,
    totales,
    scorePago,
  };
}

export type PagoDeContrataEstadoCuenta = {
  numeroCuota: number;
  fechaProgramada: Date;
  fechaPago: Date | null;
  pagado: boolean;
  montoAbonado: number;
};

export type ContrataDeEstadoCuenta = ContrataDeCliente & {
  numCuotas: number;
  totalAbonado: number;
  pagos: PagoDeContrataEstadoCuenta[];
};

export type EstadoCuentaCliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  contratas: ContrataDeEstadoCuenta[];
  totales: {
    capitalPrestado: number;
    totalAbonado: number;
    saldoPendiente: number;
  };
};

/**
 * Estado de cuenta consolidado del cliente: todas sus contratas (con su
 * detalle de pagos) y los totales acumulados. A diferencia de
 * `getClientePerfil`, incluye el desglose de pagos por contrata, necesario
 * para armar el mensaje/documento que se comparte con el cliente.
 */
export async function getEstadoCuentaCliente(
  ownerId: string,
  id: string
): Promise<EstadoCuentaCliente> {
  const cliente = await prisma.cliente.findFirst({
    where: { id, ownerId },
    include: {
      contratas: {
        include: { pagos: { orderBy: { numeroCuota: "asc" } } },
        orderBy: { creadoEn: "desc" },
      },
    },
  });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");

  // Solo contratas activas: el estado de cuenta es "cómo va" el cliente
  // ahora mismo — las liquidadas o pasadas a deuda ya no aportan nada a esa
  // foto (la deuda vive aparte, en Deudores; lo liquidado ya está en el
  // historial completo, ver getHistorialCliente).
  const contratasActivas = cliente.contratas.filter(
    (c) => !c.convertidaADeuda && estadoContrata(c.pagos) !== "LIQUIDADA"
  );

  const contratas: ContrataDeEstadoCuenta[] = contratasActivas.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    monto: c.monto,
    abono: c.abono,
    numCuotas: c.numCuotas,
    pagados: c.pagos.filter((p) => p.pagado).length,
    total: c.pagos.length,
    saldo: c.convertidaADeuda ? 0 : saldoPendiente(c.pagos, c.abono),
    estado: c.convertidaADeuda ? "EN_DEUDA" : estadoContrata(c.pagos),
    creadoEn: c.creadoEn.toISOString(),
    ultimaFechaPago: ultimaFechaPago(c.pagos),
    totalAbonado: round(c.pagos.reduce((s, p) => s + p.montoAbonado, 0)),
    pagos: c.pagos.map((p) => ({
      numeroCuota: p.numeroCuota,
      fechaProgramada: p.fechaProgramada,
      fechaPago: p.fechaPago,
      pagado: p.pagado,
      montoAbonado: p.montoAbonado,
    })),
  }));

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    contratas,
    totales: {
      capitalPrestado: round(contratas.reduce((s, c) => s + c.monto, 0)),
      totalAbonado: round(contratas.reduce((s, c) => s + c.totalAbonado, 0)),
      saldoPendiente: round(contratas.reduce((s, c) => s + c.saldo, 0)),
    },
  };
}

export type HistorialCliente = {
  id: string;
  nombre: string;
  eventos: EventoHistorial[];
};

export async function getHistorialCliente(
  ownerId: string,
  id: string
): Promise<HistorialCliente> {
  const cliente = await prisma.cliente.findFirst({
    where: { id, ownerId },
    include: { contratas: { include: { pagos: true } } },
  });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    eventos: construirHistorial(cliente.contratas),
  };
}

export async function crearCliente(ownerId: string, input: ClienteInput) {
  return prisma.cliente.create({
    data: {
      ownerId,
      nombre: input.nombre,
      telefono: input.telefono ?? null,
      direccion: input.direccion ?? null,
      referencia: input.referencia ?? null,
      notas: input.notas ?? null,
    },
  });
}

async function requireCliente(ownerId: string, id: string) {
  const cliente = await prisma.cliente.findFirst({ where: { id, ownerId } });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");
  return cliente;
}

export async function actualizarCliente(
  ownerId: string,
  id: string,
  input: Partial<ClienteInput>
) {
  await requireCliente(ownerId, id);
  return prisma.cliente.update({
    where: { id },
    data: {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
      ...(input.direccion !== undefined ? { direccion: input.direccion } : {}),
      ...(input.referencia !== undefined ? { referencia: input.referencia } : {}),
      ...(input.notas !== undefined ? { notas: input.notas } : {}),
    },
  });
}

export async function eliminarCliente(ownerId: string, id: string) {
  await requireCliente(ownerId, id);
  const conContratas = await prisma.contrata.count({
    where: { clienteId: id, ownerId },
  });
  if (conContratas > 0) {
    throw new HttpError(409, "El cliente tiene contratas y no puede eliminarse");
  }
  await prisma.cliente.delete({ where: { id } });
}
