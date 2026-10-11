import { prisma } from "@/lib/prisma";
import { enviarAUsuarios } from "@/lib/push";
import { registrarBitacora } from "./bitacora";

/**
 * Avisos push de incidentes graves de WhatsApp, solo a quien tiene acceso al
 * monitor (y solo a SUS dispositivos, no a todo su espacio).
 *
 * Lo corre el crontab del VPS cada 5 min (/api/cron/whatsapp-alertas), no el
 * worker: si el worker se cae, alguien más tiene que notarlo.
 *
 * Una vez por incidente: cada incidente tiene una clave con su identidad (p.
 * ej. el último latido del worker) y se avisa solo si esa clave no se ha
 * avisado antes (queda en la bitácora como "push_alerta").
 */

export type Incidente = { clave: string; titulo: string; cuerpo: string };

const LATIDO_MAX_MS = 3 * 60_000;
const SESION_CAIDA_MS = 10 * 60_000;

export async function incidentesGraves(ahora = new Date()): Promise<Incidente[]> {
  const [control, cuentas] = await Promise.all([
    prisma.controlWhatsApp.findUnique({ where: { id: "global" } }),
    prisma.cuentaWhatsApp.findMany({
      include: {
        owner: { select: { nombre: true, email: true } },
        llaves: { where: { tipo: "creds" }, select: { cuentaId: true } },
        campanas: { where: { estado: "PAUSADA" }, orderBy: { actualizadoEn: "desc" }, take: 1 },
      },
    }),
  ]);
  if (cuentas.length === 0) return [];
  const fuera: Incidente[] = [];
  const t = ahora.getTime();

  const latidoEn = control?.latidoEn ?? null;
  const workerVivo = Boolean(latidoEn && t - latidoEn.getTime() < LATIDO_MAX_MS);
  if (!workerVivo) {
    fuera.push({
      clave: `worker_caido:${latidoEn?.toISOString() ?? "nunca"}`,
      titulo: "WhatsApp: el worker no responde",
      cuerpo: "No se están enviando recibos ni recordatorios. Revisa el contenedor whatsapp en el VPS.",
    });
  }

  const latido = control?.latido as { huella?: string } | null;
  const huellaApp = process.env.WHATSAPP_HUELLA_APP ?? null;
  if (workerVivo && huellaApp && latido?.huella && latido.huella !== huellaApp) {
    fuera.push({
      clave: `huella:${huellaApp}:${latido.huella}`,
      titulo: "WhatsApp: worker desactualizado",
      cuerpo: "Cambió código que usa el worker. Reconstrúyelo en el VPS (ver Monitor → WhatsApp).",
    });
  }

  for (const c of cuentas) {
    const quien = c.owner.nombre ?? c.owner.email;
    if (c.estado === "BLOQUEADO") {
      fuera.push({
        clave: `bloqueado:${c.id}:${(c.pausadaPorAdminEn ?? c.actualizadoEn).toISOString()}`,
        titulo: `WhatsApp: número de ${quien} restringido`,
        cuerpo: `${c.numero} quedó pausado. ${c.ultimoError ?? ""}`.trim(),
      });
    }
    // Solo si tenía sesión guardada: una cuenta que desvinculaste a propósito no es un incidente.
    if (
      workerVivo &&
      c.estado === "DESCONECTADO" &&
      c.llaves.length > 0 &&
      c.ultimaConexion &&
      t - c.ultimaConexion.getTime() > SESION_CAIDA_MS
    ) {
      fuera.push({
        clave: `sesion_caida:${c.id}:${c.ultimaConexion.toISOString()}`,
        titulo: `WhatsApp: ${quien} desconectado`,
        cuerpo: `La sesión de ${c.numero} lleva más de 10 minutos caída y no se ha reconectado.`,
      });
    }
    const campana = c.campanas[0];
    if (campana?.pausaMotivo?.startsWith("Freno")) {
      fuera.push({
        clave: `freno:${campana.id}:${campana.actualizadoEn.toISOString()}`,
        titulo: `WhatsApp: campaña de ${quien} pausada`,
        cuerpo: campana.pausaMotivo,
      });
    }
  }
  return fuera;
}

type Enviar = (userIds: string[], payload: { title: string; body: string; url?: string }) => Promise<{ enviadas: number; deshabilitado: boolean }>;

export async function avisarIncidentes(opts: { enviar?: Enviar; ahora?: Date } = {}) {
  const enviar = opts.enviar ?? enviarAUsuarios;
  const incidentes = await incidentesGraves(opts.ahora);
  if (incidentes.length === 0) return { incidentes: 0, avisados: 0 };

  const admins = (await prisma.user.findMany({ where: { accesoMonitor: true }, select: { id: true } })).map((u) => u.id);
  let avisados = 0;
  for (const inc of incidentes) {
    const ya = await prisma.bitacoraWhatsApp.findFirst({
      where: { tipo: "push_alerta", detalle: { path: ["clave"], equals: inc.clave } },
      select: { id: true },
    });
    if (ya) continue;
    const r = await enviar(admins, { title: inc.titulo, body: inc.cuerpo, url: "/monitor/whatsapp" });
    // Sin push configurado no se marca como avisado: se avisará cuando lo esté.
    if (r.deshabilitado) continue;
    await registrarBitacora({ tipo: "push_alerta", detalle: { clave: inc.clave, titulo: inc.titulo, enviadas: r.enviadas } });
    avisados++;
  }
  return { incidentes: incidentes.length, avisados };
}
