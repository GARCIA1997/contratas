import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Prisma, TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { calcularFechasPago } from "@/lib/fechas";
import { saldoPendiente, montoVencidoOVigente, cuotasVencidasOVigentes } from "@/lib/contrata";

export type ContrataConDatos = Prisma.ContrataGetPayload<{
  include: { cliente: true; pagos: true };
}>;

const includeDatos = { cliente: true, pagos: { orderBy: { numeroCuota: "asc" } } } as const;

/** Todas las contratas del usuario, opcionalmente filtradas por tipo. */
export async function listContratas(
  ownerId: string,
  tipo?: TipoContrata
): Promise<ContrataConDatos[]> {
  return prisma.contrata.findMany({
    where: { ownerId, ...(tipo ? { tipo } : {}) },
    include: includeDatos,
    orderBy: { creadoEn: "desc" },
  });
}

/** Una contrata del usuario; lanza 404 si no existe o no le pertenece. */
export async function getContrata(
  ownerId: string,
  id: string
): Promise<ContrataConDatos> {
  const contrata = await prisma.contrata.findFirst({
    where: { id, ownerId },
    include: includeDatos,
  });
  if (!contrata) throw new HttpError(404, "Contrata no encontrada");
  return contrata;
}

type CrearInput = {
  clienteId?: string;
  clienteNombre?: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  fechaInicio: string;
  numCuotas: number;
  notas?: string | null;
};

/** Resuelve el cliente destino garantizando que pertenece al usuario. */
async function resolverClienteId(
  ownerId: string,
  input: { clienteId?: string; clienteNombre?: string },
  tx: Prisma.TransactionClient
): Promise<string> {
  if (input.clienteId) {
    const cliente = await tx.cliente.findFirst({
      where: { id: input.clienteId, ownerId },
      select: { id: true },
    });
    if (!cliente) throw new HttpError(400, "Cliente inválido");
    return cliente.id;
  }
  if (input.clienteNombre) {
    const nuevo = await tx.cliente.create({
      data: { ownerId, nombre: input.clienteNombre },
      select: { id: true },
    });
    return nuevo.id;
  }
  throw new HttpError(400, "Debes indicar un cliente");
}

export async function crearContrata(
  ownerId: string,
  input: CrearInput
): Promise<ContrataConDatos> {
  const config = await getConfig(ownerId);
  const fechaInicio = new Date(input.fechaInicio);
  const fechas = calcularFechasPago(
    input.tipo,
    config.modoFechasQuincenal,
    fechaInicio,
    input.numCuotas,
    config.diaCobroSemanal
  );
  const mes = format(fechaInicio, "LLLL yyyy", { locale: es });

  return prisma.$transaction(async (tx) => {
    const clienteId = await resolverClienteId(ownerId, input, tx);
    return tx.contrata.create({
      data: {
        ownerId,
        clienteId,
        tipo: input.tipo,
        monto: input.monto,
        abono: input.abono,
        fechaInicio,
        numCuotas: input.numCuotas,
        mes,
        notas: input.notas ?? null,
        pagos: {
          create: fechas.map((fechaProgramada, i) => ({
            numeroCuota: i + 1,
            fechaProgramada,
          })),
        },
      },
      include: includeDatos,
    });
  });
}

type ActualizarInput = Partial<CrearInput>;

export async function actualizarContrata(
  ownerId: string,
  id: string,
  input: ActualizarInput
): Promise<ContrataConDatos> {
  const actual = await getContrata(ownerId, id);
  const config = await getConfig(ownerId);

  const tipo = input.tipo ?? actual.tipo;
  const numCuotas = input.numCuotas ?? actual.numCuotas;
  const fechaInicio = input.fechaInicio
    ? new Date(input.fechaInicio)
    : actual.fechaInicio;

  // ¿Cambió algo que afecte el calendario de pagos?
  const recalcular =
    input.tipo !== undefined ||
    input.numCuotas !== undefined ||
    input.fechaInicio !== undefined;

  return prisma.$transaction(async (tx) => {
    if (recalcular) {
      const fechas = calcularFechasPago(
        tipo,
        config.modoFechasQuincenal,
        fechaInicio,
        numCuotas,
        config.diaCobroSemanal
      );
      // Preserva el estado pagado por número de cuota.
      const pagadoPrev = new Map(
        actual.pagos.map((p) => [p.numeroCuota, p])
      );
      await tx.pago.deleteMany({ where: { contrataId: id } });
      await tx.pago.createMany({
        data: fechas.map((fechaProgramada, i) => {
          const prev = pagadoPrev.get(i + 1);
          return {
            contrataId: id,
            numeroCuota: i + 1,
            fechaProgramada,
            pagado: prev?.pagado ?? false,
            fechaPago: prev?.pagado ? prev.fechaPago : null,
          };
        }),
      });
    }

    return tx.contrata.update({
      where: { id },
      data: {
        tipo,
        numCuotas,
        fechaInicio,
        mes: recalcular
          ? format(fechaInicio, "LLLL yyyy", { locale: es })
          : actual.mes,
        ...(input.monto !== undefined ? { monto: input.monto } : {}),
        ...(input.abono !== undefined ? { abono: input.abono } : {}),
        ...(input.notas !== undefined ? { notas: input.notas } : {}),
        ...(input.clienteId
          ? {
              clienteId: (
                await resolverClienteId(ownerId, { clienteId: input.clienteId }, tx)
              ),
            }
          : {}),
      },
      include: includeDatos,
    });
  });
}

export async function eliminarContrata(
  ownerId: string,
  id: string
): Promise<void> {
  await getContrata(ownerId, id); // valida propiedad
  await prisma.contrata.delete({ where: { id } });
}

/** Alterna el estado pagado de una cuota (pago completo de un toque). */
export async function togglePago(
  ownerId: string,
  contrataId: string,
  numeroCuota: number
): Promise<ContrataConDatos> {
  const contrata = await getContrata(ownerId, contrataId);
  const pago = contrata.pagos.find((p) => p.numeroCuota === numeroCuota);
  if (!pago) throw new HttpError(404, "Cuota no encontrada");

  const pagado = !pago.pagado;
  await prisma.pago.update({
    where: { id: pago.id },
    data: {
      pagado,
      fechaPago: pagado ? new Date() : null,
      montoAbonado: pagado ? contrata.abono : 0,
    },
  });
  return getContrata(ownerId, contrataId);
}

const EPSILON = 0.01;

/**
 * Registra un abono (parcial o total) sobre una cuota. Suma al monto ya
 * abonado; la cuota queda "pagado" cuando el acumulado alcanza el abono
 * esperado de la contrata.
 */
export async function abonarPago(
  ownerId: string,
  contrataId: string,
  numeroCuota: number,
  monto: number
): Promise<ContrataConDatos> {
  if (monto <= 0) throw new HttpError(400, "El abono debe ser mayor a 0");
  const contrata = await getContrata(ownerId, contrataId);
  const pago = contrata.pagos.find((p) => p.numeroCuota === numeroCuota);
  if (!pago) throw new HttpError(404, "Cuota no encontrada");

  const nuevoMonto = Math.round((pago.montoAbonado + monto) * 100) / 100;
  const pagado = nuevoMonto >= contrata.abono - EPSILON;

  await prisma.pago.update({
    where: { id: pago.id },
    data: {
      montoAbonado: nuevoMonto,
      pagado,
      fechaPago: pagado ? new Date() : pago.fechaPago,
    },
  });
  return getContrata(ownerId, contrataId);
}

/** Revierte una cuota a pendiente sin abonos (corrige un error de captura). */
export async function limpiarPago(
  ownerId: string,
  contrataId: string,
  numeroCuota: number
): Promise<ContrataConDatos> {
  const contrata = await getContrata(ownerId, contrataId);
  const pago = contrata.pagos.find((p) => p.numeroCuota === numeroCuota);
  if (!pago) throw new HttpError(404, "Cuota no encontrada");

  await prisma.pago.update({
    where: { id: pago.id },
    data: { montoAbonado: 0, pagado: false, fechaPago: null },
  });
  return getContrata(ownerId, contrataId);
}

export type ConversionADeuda = {
  contrata: ContrataConDatos;
  deudorId: string;
  deudorNombre: string;
  montoTransferido: number;
  deudaAcumulada: number;
};

/**
 * Marca el saldo pendiente de una contrata como deuda: crea (o suma a) el
 * registro de Deudor con el mismo nombre que el cliente. Es un proceso
 * manual — no se dispara automáticamente al vencer el plazo.
 */
export async function convertirADeuda(
  ownerId: string,
  contrataId: string
): Promise<ConversionADeuda> {
  const contrata = await getContrata(ownerId, contrataId);
  if (contrata.convertidaADeuda) {
    throw new HttpError(400, "Esta contrata ya fue marcada como deuda");
  }
  const saldo = saldoPendiente(contrata.pagos, contrata.abono);
  if (saldo <= 0) {
    throw new HttpError(400, "Esta contrata no tiene saldo pendiente");
  }

  const nombre = contrata.cliente.nombre.trim().toUpperCase();

  const resultado = await prisma.$transaction(async (tx) => {
    let deudor = await tx.deudor.findFirst({ where: { ownerId, nombre } });
    if (deudor) {
      deudor = await tx.deudor.update({
        where: { id: deudor.id },
        data: { deudaInicial: { increment: saldo } },
      });
    } else {
      deudor = await tx.deudor.create({
        data: {
          ownerId,
          nombre,
          deudaInicial: saldo,
          notas: `Generada desde contrata ${contrata.tipo.toLowerCase()} de ${contrata.mes}`,
        },
      });
    }

    const contrataActualizada = await tx.contrata.update({
      where: { id: contrataId },
      data: { convertidaADeuda: true, deudorId: deudor.id },
      include: includeDatos,
    });

    return { deudor, contrataActualizada };
  });

  return {
    contrata: resultado.contrataActualizada,
    deudorId: resultado.deudor.id,
    deudorNombre: resultado.deudor.nombre,
    montoTransferido: saldo,
    deudaAcumulada: resultado.deudor.deudaInicial,
  };
}

// ---------------------------------------------------------------------------
// Renovación / unificación de contratas
// ---------------------------------------------------------------------------

type NuevaContrataInput = {
  tipo: TipoContrata;
  monto: number;
  abono: number;
  fechaInicio: string;
  numCuotas: number;
  notas?: string | null;
};

/** Todas las contratas del cliente con saldo pendiente > 0 y no liquidadas/convertidas. */
export async function contratasConSaldo(
  ownerId: string,
  clienteId: string,
  excluirId?: string
) {
  const contratas = await prisma.contrata.findMany({
    where: {
      ownerId,
      clienteId,
      convertidaADeuda: false,
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    include: { pagos: true },
  });
  return contratas
    .map((c) => ({ ...c, saldo: saldoPendiente(c.pagos, c.abono) }))
    .filter((c) => c.saldo > 0);
}

/**
 * Contratas del cliente con cuotas vencidas, vigentes o próximas a vencer
 * (mismo `DIAS_ANTICIPACION_COBRO` que usa Ruta). A diferencia de
 * `contratasConSaldo`, `saldo` aquí solo cubre esas cuotas, no el total
 * restante de la contrata — se usa para la opción "incluir otras" al
 * renovar, que no debe liquidar contratas al corriente por adelantado.
 */
export async function contratasConVencido(
  ownerId: string,
  clienteId: string,
  excluirId?: string,
  hoy: Date = new Date()
) {
  const contratas = await prisma.contrata.findMany({
    where: {
      ownerId,
      clienteId,
      convertidaADeuda: false,
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    include: { pagos: true },
  });
  return contratas
    .map((c) => ({ ...c, saldo: montoVencidoOVigente(c.pagos, c.abono, hoy) }))
    .filter((c) => c.saldo > 0);
}

/** Crea la contrata nueva (misma mecánica que crearContrata) dentro de una transacción. */
async function crearContrataTx(
  tx: Prisma.TransactionClient,
  ownerId: string,
  clienteId: string,
  input: NuevaContrataInput,
  config: Awaited<ReturnType<typeof getConfig>>
) {
  const fechaInicio = new Date(input.fechaInicio);
  const fechas = calcularFechasPago(
    input.tipo,
    config.modoFechasQuincenal,
    fechaInicio,
    input.numCuotas,
    config.diaCobroSemanal
  );
  const mes = format(fechaInicio, "LLLL yyyy", { locale: es });
  return tx.contrata.create({
    data: {
      ownerId,
      clienteId,
      tipo: input.tipo,
      monto: input.monto,
      abono: input.abono,
      fechaInicio,
      numCuotas: input.numCuotas,
      mes,
      notas: input.notas ?? null,
      pagos: {
        create: fechas.map((fechaProgramada, i) => ({
          numeroCuota: i + 1,
          fechaProgramada,
        })),
      },
    },
    include: includeDatos,
  });
}

/** Marca como pagadas (pago completo) todas las cuotas no pagadas de una contrata. */
async function liquidarContrataTx(
  tx: Prisma.TransactionClient,
  contrata: { id: string; abono: number; pagos: { id: string; pagado: boolean }[] }
) {
  const ahora = new Date();
  const pendientes = contrata.pagos.filter((p) => !p.pagado);
  for (const p of pendientes) {
    await tx.pago.update({
      where: { id: p.id },
      data: { pagado: true, montoAbonado: contrata.abono, fechaPago: ahora },
    });
  }
}

/**
 * Marca como pagadas únicamente las cuotas vencidas, vigentes o próximas a
 * vencer (mismo criterio que `contratasConVencido`, para liquidar
 * exactamente lo que el checkbox mostró) de una contrata; las cuotas más
 * allá de esa ventana quedan intactas y la contrata sigue activa.
 */
async function liquidarVencidasTx(
  tx: Prisma.TransactionClient,
  contrata: {
    id: string;
    abono: number;
    pagos: { id: string; pagado: boolean; fechaProgramada: Date }[];
  },
  hoy: Date = new Date()
) {
  const ahora = new Date();
  const vencidas = cuotasVencidasOVigentes(contrata.pagos, hoy);
  for (const p of vencidas) {
    await tx.pago.update({
      where: { id: p.id },
      data: { pagado: true, montoAbonado: contrata.abono, fechaPago: ahora },
    });
  }
}

export type ResultadoRenovacion = {
  nuevaContrata: ContrataConDatos;
  montoEntregado: number;
  saldoLiquidado: number;
  contratasLiquidadas: number;
};

/**
 * Renueva una contrata antes de tiempo: crea una contrata nueva y marca como
 * pagada (liquidada) la contrata original. Si `incluirOtras` es true, también
 * cubre las cuotas vencidas, vigentes o próximas a vencer del resto de las
 * contratas activas del mismo cliente — no su saldo completo, que sigue
 * corriendo con normalidad.
 */
export async function renovarContrata(
  ownerId: string,
  contrataId: string,
  input: NuevaContrataInput,
  incluirOtras: boolean
): Promise<ResultadoRenovacion> {
  const original = await getContrata(ownerId, contrataId);
  if (original.convertidaADeuda) {
    throw new HttpError(400, "Esta contrata ya fue convertida a deuda");
  }
  const saldoOriginal = saldoPendiente(original.pagos, original.abono);
  if (saldoOriginal <= 0) {
    throw new HttpError(400, "Esta contrata no tiene saldo pendiente");
  }

  const otras = incluirOtras
    ? await contratasConVencido(ownerId, original.clienteId, contrataId)
    : [];
  const saldoTotal =
    round2(saldoOriginal) + round2(otras.reduce((s, c) => s + c.saldo, 0));

  if (input.monto < saldoTotal) {
    throw new HttpError(
      400,
      `El monto debe cubrir el saldo pendiente (${saldoTotal})`
    );
  }

  const config = await getConfig(ownerId);

  const resultado = await prisma.$transaction(async (tx) => {
    const nueva = await crearContrataTx(
      tx,
      ownerId,
      original.clienteId,
      input,
      config
    );
    await liquidarContrataTx(tx, original);
    for (const c of otras) {
      await liquidarVencidasTx(tx, c);
    }
    return nueva;
  });

  return {
    nuevaContrata: resultado,
    montoEntregado: round2(input.monto - saldoTotal),
    saldoLiquidado: saldoTotal,
    contratasLiquidadas: 1 + otras.length,
  };
}

/**
 * Unifica dos o más contratas del mismo cliente en una nueva: crea la
 * contrata nueva y marca como pagadas todas las seleccionadas.
 */
export async function unificarContratas(
  ownerId: string,
  clienteId: string,
  contrataIds: string[],
  input: NuevaContrataInput
): Promise<ResultadoRenovacion> {
  if (contrataIds.length < 2) {
    throw new HttpError(400, "Selecciona al menos dos contratas para unificar");
  }

  const contratas = await prisma.contrata.findMany({
    where: {
      id: { in: contrataIds },
      ownerId,
      clienteId,
      convertidaADeuda: false,
    },
    include: { pagos: true },
  });
  if (contratas.length !== contrataIds.length) {
    throw new HttpError(400, "Alguna contrata seleccionada no es válida");
  }

  const conSaldo = contratas.map((c) => ({
    ...c,
    saldo: saldoPendiente(c.pagos, c.abono),
  }));
  const saldoTotal = round2(conSaldo.reduce((s, c) => s + c.saldo, 0));
  if (saldoTotal <= 0) {
    throw new HttpError(400, "Las contratas seleccionadas no tienen saldo pendiente");
  }
  if (input.monto < saldoTotal) {
    throw new HttpError(
      400,
      `El monto debe cubrir el saldo pendiente (${saldoTotal})`
    );
  }

  const config = await getConfig(ownerId);

  const resultado = await prisma.$transaction(async (tx) => {
    const nueva = await crearContrataTx(tx, ownerId, clienteId, input, config);
    for (const c of conSaldo) {
      await liquidarContrataTx(tx, c);
    }
    return nueva;
  });

  return {
    nuevaContrata: resultado,
    montoEntregado: round2(input.monto - saldoTotal),
    saldoLiquidado: saldoTotal,
    contratasLiquidadas: conSaldo.length,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
