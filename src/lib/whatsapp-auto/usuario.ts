import { startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { registrarBitacora } from "./bitacora";
import { normalizarTelefono } from "./telefono";
import { CUPO_DIARIO, LATIDO_MAX_MS } from "./reglas";

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
 * Por qué el recibo automático no va a salir ahora mismo (worker caído,
 * número desconectado o en pausa). `null` = el canal funciona.
 */
async function canalCaido(ownerId: string): Promise<string | null> {
  const [cuenta, control] = await Promise.all([
    prisma.cuentaWhatsApp.findUnique({ where: { ownerId }, select: { estado: true, pausadaPorAdmin: true, pausadaPorUsuario: true } }),
    prisma.controlWhatsApp.findUnique({ where: { id: "global" }, select: { latidoEn: true, paroGlobal: true } }),
  ]);
  if (!cuenta) return null;
  if (!control?.latidoEn || Date.now() - control.latidoEn.getTime() > LATIDO_MAX_MS) return "El servicio de WhatsApp no responde";
  if (control.paroGlobal || cuenta.pausadaPorAdmin || cuenta.pausadaPorUsuario) return "El envío automático está en pausa";
  if (cuenta.estado !== "CONECTADO") return "El WhatsApp del negocio está desconectado";
  return null;
}

/**
 * Resumen para la pantalla del cobro. `null` = el servidor todavía no tiene
 * recibo para esos cobros (aún no llegan, o no aplica). `canalCaido` avisa a
 * la pantalla que conviene ofrecer el envío manual sin esperar.
 */
export async function estadoDeRecibos(
  ownerId: string,
  claves: string[],
  telefono?: string | null
): Promise<{ estado: EstadoRecibo; motivo: string | null; canalCaido: string | null }> {
  if (claves.length === 0) return { estado: null, motivo: null, canalCaido: null };
  const filas = await prisma.mensajeWhatsApp.findMany({
    where: { ownerId, tipo: "RECIBO", claveDedupe: { in: claves.map((c) => `recibo:${c}`) } },
    select: { estado: true, motivo: true },
  });
  if (filas.length === 0) {
    // Quien respondió NO no recibe automáticos: la pantalla ofrece el manual de inmediato.
    const tel = normalizarTelefono(telefono);
    if (tel) {
      const optOut = await prisma.optOutWhatsApp.findFirst({
        where: { telefono: tel, activo: true, cuenta: { ownerId } },
        select: { activo: true },
      });
      if (optOut) {
        return { estado: "fallo", motivo: "El cliente pidió no recibir mensajes automáticos", canalCaido: null };
      }
    }
    return { estado: null, motivo: null, canalCaido: null };
  }
  const fallo = filas.find((f) => ["FALLIDO", "CANCELADO", "REVISAR"].includes(f.estado));
  if (fallo) return { estado: "fallo", motivo: fallo.motivo, canalCaido: null };
  if (filas.every((f) => f.estado === "ENVIADO")) return { estado: "enviado", motivo: null, canalCaido: null };
  return { estado: "enviando", motivo: null, canalCaido: await canalCaido(ownerId) };
}

/**
 * El usuario va a mandar el recibo a mano: el automático que sigue pendiente
 * se cancela para que al cliente no le llegue dos veces.
 */
export async function cancelarRecibosParaEnvioManual(ownerId: string, claves: string[]): Promise<number> {
  if (claves.length === 0) return 0;
  const r = await prisma.mensajeWhatsApp.updateMany({
    where: { ownerId, tipo: "RECIBO", estado: "PENDIENTE", claveDedupe: { in: claves.map((c) => `recibo:${c}`) } },
    data: { estado: "CANCELADO", motivo: "Se envió a mano desde la app" },
  });
  return r.count;
}
