import { endOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import type { CitaInput, CitaUpdateInput } from "@/lib/validaciones";

const CLIENTE_SELECT = { nombre: true, telefono: true } as const;

async function requireCliente(ownerId: string, clienteId: string) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, ownerId },
  });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");
  return cliente;
}

async function validarContrataOrigen(
  ownerId: string,
  clienteId: string,
  contrataOrigenId: string
) {
  const contrata = await prisma.contrata.findFirst({
    where: { id: contrataOrigenId, ownerId, clienteId, convertidaADeuda: false },
  });
  if (!contrata) {
    throw new HttpError(400, "La contrata origen no pertenece a este cliente");
  }
}

/**
 * Valida que las contratas elegidas para una futura unificación existan,
 * sean del cliente y sigan activas. No exige el mínimo de 2 aquí a
 * propósito (igual que `contrataOrigenId`, se puede agendar sin haber
 * decidido todavía) — `unificarContratas` es quien exige 2+ al convertir.
 */
async function validarContratasUnificar(
  ownerId: string,
  clienteId: string,
  ids: string[]
) {
  if (ids.length === 0) return;
  const contratas = await prisma.contrata.findMany({
    where: { id: { in: ids }, ownerId, clienteId, convertidaADeuda: false },
    select: { id: true },
  });
  if (contratas.length !== new Set(ids).size) {
    throw new HttpError(
      400,
      "Alguna de las contratas seleccionadas no pertenece a este cliente"
    );
  }
}

async function requireCita(ownerId: string, id: string) {
  const cita = await prisma.citaAgendada.findFirst({ where: { id, ownerId } });
  if (!cita) throw new HttpError(404, "Cita no encontrada");
  return cita;
}

export async function crearCita(ownerId: string, input: CitaInput) {
  // Agendada en modo local y ya recibida antes (reintento): se devuelve la
  // existente en vez de chocar con el id (P2002 → 500 → cola atorada).
  if (input.id) {
    const existente = await prisma.citaAgendada.findFirst({
      where: { id: input.id, ownerId },
      include: { cliente: { select: CLIENTE_SELECT } },
    });
    if (existente) return existente;
  }
  await requireCliente(ownerId, input.clienteId);
  // "Nueva" nunca lleva contrata origen, y "Unificación" usa
  // `contratasUnificarIds` en su lugar — se ignora lo que no aplique al
  // tipo elegido, aunque venga en el input (defensa en profundidad, además
  // del guard en el formulario).
  const contrataOrigenId =
    input.tipo === "NUEVA" || input.tipo === "UNIFICACION"
      ? null
      : input.contrataOrigenId ?? null;
  if (contrataOrigenId) {
    await validarContrataOrigen(ownerId, input.clienteId, contrataOrigenId);
  }
  const contratasUnificarIds =
    input.tipo === "UNIFICACION" ? input.contratasUnificarIds ?? [] : [];
  await validarContratasUnificar(ownerId, input.clienteId, contratasUnificarIds);
  return prisma.citaAgendada.create({
    data: {
      // Agendada en modo local: nace con el id que ya tiene en el teléfono.
      ...(input.id ? { id: input.id } : {}),
      ownerId,
      clienteId: input.clienteId,
      contrataOrigenId,
      contratasUnificarIds,
      tipo: input.tipo,
      periodicidad: input.periodicidad ?? null,
      montoEstimado: input.montoEstimado,
      fechaEntrega: new Date(input.fechaEntrega),
      notas: input.notas ?? null,
    },
    include: { cliente: { select: CLIENTE_SELECT } },
  });
}

/** Pendientes con fechaEntrega de hoy o ya vencida — recordatorio del día en Ruta. */
export async function listCitasDelDia(ownerId: string, hoy: Date = new Date()) {
  return prisma.citaAgendada.findMany({
    where: {
      ownerId,
      estado: "PENDIENTE",
      fechaEntrega: { lte: endOfDay(hoy) },
    },
    include: { cliente: { select: CLIENTE_SELECT } },
    orderBy: { fechaEntrega: "asc" },
  });
}

/** Todas las citas del owner (para el pull-sync offline). */
export async function listCitas(ownerId: string) {
  return prisma.citaAgendada.findMany({
    where: { ownerId },
    include: { cliente: { select: CLIENTE_SELECT } },
    orderBy: { fechaEntrega: "asc" },
  });
}

export async function listCitasDeCliente(ownerId: string, clienteId: string) {
  return prisma.citaAgendada.findMany({
    where: { ownerId, clienteId, estado: "PENDIENTE" },
    include: { cliente: { select: CLIENTE_SELECT } },
    orderBy: { fechaEntrega: "asc" },
  });
}

export async function getCita(ownerId: string, id: string) {
  return prisma.citaAgendada.findFirst({
    where: { id, ownerId },
    include: { cliente: { select: CLIENTE_SELECT } },
  });
}

export async function actualizarCita(
  ownerId: string,
  id: string,
  input: CitaUpdateInput
) {
  const cita = await requireCita(ownerId, id);
  if (cita.estado !== "PENDIENTE") {
    throw new HttpError(409, "Solo se puede reagendar una cita pendiente");
  }
  const clienteId = input.clienteId ?? cita.clienteId;
  if (input.clienteId) await requireCliente(ownerId, input.clienteId);
  const tipoEfectivo = input.tipo ?? cita.tipo;
  // "Nueva" nunca lleva contrata origen, y "Unificación" usa
  // `contratasUnificarIds` en su lugar — se ignora aunque venga en el
  // input (defensa en profundidad, además del guard en el formulario).
  const contrataOrigenId =
    tipoEfectivo === "NUEVA" || tipoEfectivo === "UNIFICACION"
      ? null
      : input.contrataOrigenId !== undefined
        ? input.contrataOrigenId
        : cita.contrataOrigenId;
  if (contrataOrigenId) {
    await validarContrataOrigen(ownerId, clienteId, contrataOrigenId);
  }
  const contratasUnificarIds =
    tipoEfectivo === "UNIFICACION"
      ? input.contratasUnificarIds !== undefined
        ? input.contratasUnificarIds
        : cita.contratasUnificarIds
      : [];
  await validarContratasUnificar(ownerId, clienteId, contratasUnificarIds);
  return prisma.citaAgendada.update({
    where: { id },
    data: {
      ...(input.clienteId !== undefined ? { clienteId: input.clienteId } : {}),
      contrataOrigenId,
      contratasUnificarIds,
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
      ...(input.periodicidad !== undefined
        ? { periodicidad: input.periodicidad }
        : {}),
      ...(input.montoEstimado !== undefined
        ? { montoEstimado: input.montoEstimado }
        : {}),
      ...(input.fechaEntrega !== undefined
        ? { fechaEntrega: new Date(input.fechaEntrega) }
        : {}),
      ...(input.notas !== undefined ? { notas: input.notas } : {}),
    },
    include: { cliente: { select: CLIENTE_SELECT } },
  });
}

/** Soft: nunca se borra, queda de historial de "se agendó y no se dio". */
export async function cancelarCita(ownerId: string, id: string) {
  const cita = await requireCita(ownerId, id);
  if (cita.estado !== "PENDIENTE") {
    throw new HttpError(409, "Solo se puede descartar una cita pendiente");
  }
  return prisma.citaAgendada.update({
    where: { id },
    data: { estado: "CANCELADA" },
  });
}

export async function marcarEntregada(
  ownerId: string,
  id: string,
  contrataCreadaId: string | null
) {
  const cita = await requireCita(ownerId, id);
  if (cita.estado !== "PENDIENTE") return cita;
  return prisma.citaAgendada.update({
    where: { id },
    data: { estado: "ENTREGADA", contrataCreadaId },
  });
}
