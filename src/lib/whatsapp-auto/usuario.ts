import { startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { registrarBitacora } from "./bitacora";
import { normalizarTelefono } from "./telefono";
import { CUPO_DIARIO } from "./reglas";

/**
 * Lo que el usuario ve y controla de SU número en Configuración: estado,
 * enviados hoy, interruptores y pausa. No ve el historial de mensajes (eso
 * es solo del monitor) ni puede vincular, cambiar o quitar el número.
 */

export async function cuentaDelUsuario(ownerId: string) {
  const cuenta = await prisma.cuentaWhatsApp.findUnique({ where: { ownerId } });
  if (!cuenta) return null;
  const [enviadosHoy, ultimo, control] = await Promise.all([
    prisma.envioWhatsApp.count({ where: { cuentaId: cuenta.id, enviadoEn: { gte: startOfDay(new Date()) } } }),
    prisma.envioWhatsApp.findFirst({ where: { cuentaId: cuenta.id }, orderBy: { enviadoEn: "desc" }, select: { enviadoEn: true } }),
    prisma.controlWhatsApp.findUnique({ where: { id: "global" }, select: { paroGlobal: true } }),
  ]);
  return {
    numero: cuenta.numero,
    conectado: cuenta.estado === "CONECTADO",
    estado: cuenta.estado,
    activo: cuenta.activo,
    aceptoRiesgoEn: cuenta.aceptoRiesgoEn,
    recibos: cuenta.recibos,
    porVencer: cuenta.porVencer,
    vencidas: cuenta.vencidas,
    deudores: cuenta.deudores,
    pausadaPorUsuario: cuenta.pausadaPorUsuario,
    pausadaPorAdmin: cuenta.pausadaPorAdmin || (control?.paroGlobal ?? false),
    numeroManual: cuenta.numeroManual,
    enviadosHoy,
    cupo: CUPO_DIARIO,
    ultimoEnvio: ultimo?.enviadoEn ?? null,
  };
}

export type CambioCuentaUsuario = {
  activo?: boolean;
  aceptoRiesgo?: boolean;
  recibos?: boolean;
  porVencer?: boolean;
  vencidas?: boolean;
  deudores?: boolean;
  pausada?: boolean;
  numeroManual?: string | null;
  confirmoMismoNumero?: boolean;
};

export async function actualizarCuentaUsuario(ownerId: string, cambio: CambioCuentaUsuario, actor: string) {
  const cuenta = await prisma.cuentaWhatsApp.findUnique({ where: { ownerId } });
  if (!cuenta) throw new HttpError(404, "Tu espacio no tiene un número de WhatsApp asignado");

  const data: Record<string, unknown> = {};
  if (cambio.activo === true && !cuenta.activo) {
    if (cuenta.estado !== "CONECTADO") throw new HttpError(400, "El número todavía no está conectado");
    if (!cambio.aceptoRiesgo && !cuenta.aceptoRiesgoEn) {
      throw new HttpError(400, "Debes aceptar el riesgo de bloqueo del número");
    }
    data.activo = true;
    if (cambio.aceptoRiesgo) data.aceptoRiesgoEn = new Date();
  } else if (cambio.activo === false) {
    data.activo = false;
  }
  for (const k of ["recibos", "porVencer", "vencidas", "deudores"] as const) {
    if (typeof cambio[k] === "boolean") data[k] = cambio[k];
  }
  if (typeof cambio.pausada === "boolean") {
    data.pausadaPorUsuario = cambio.pausada;
    data.pausadaPorUsuarioEn = cambio.pausada ? new Date() : null;
  }
  if (cambio.numeroManual !== undefined) {
    const manual = cambio.numeroManual ? normalizarTelefono(cambio.numeroManual) : null;
    if (cambio.numeroManual && !manual) throw new HttpError(400, "Número manual inválido");
    if (manual && manual === cuenta.numero && !cambio.confirmoMismoNumero) {
      throw new HttpError(400, "El número manual es el mismo que el automático: confirma que lo entiendes");
    }
    data.numeroManual = manual;
    data.numeroManualConfirmadoEn = manual && manual === cuenta.numero ? new Date() : null;
  }
  await prisma.cuentaWhatsApp.update({ where: { id: cuenta.id }, data });
  await registrarBitacora({ cuentaId: cuenta.id, tipo: "config_usuario", detalle: JSON.parse(JSON.stringify(cambio)), actor });
}

export type EstadoRecibo = "enviando" | "enviado" | "fallo" | null;

/**
 * Resumen para la pantalla del cobro. `null` = el servidor todavía no tiene
 * recibo para esos cobros (aún no llegan, o no aplica).
 */
export async function estadoDeRecibos(
  ownerId: string,
  claves: string[]
): Promise<{ estado: EstadoRecibo; motivo: string | null }> {
  if (claves.length === 0) return { estado: null, motivo: null };
  const filas = await prisma.mensajeWhatsApp.findMany({
    where: { ownerId, tipo: "RECIBO", claveDedupe: { in: claves.map((c) => `recibo:${c}`) } },
    select: { estado: true, motivo: true },
  });
  if (filas.length === 0) return { estado: null, motivo: null };
  const fallo = filas.find((f) => ["FALLIDO", "CANCELADO", "REVISAR"].includes(f.estado));
  if (fallo) return { estado: "fallo", motivo: fallo.motivo };
  if (filas.every((f) => f.estado === "ENVIADO")) return { estado: "enviado", motivo: null };
  return { estado: "enviando", motivo: null };
}
