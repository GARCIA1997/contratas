import { prisma } from "@/lib/prisma";
import { registrarBitacora } from "@/lib/whatsapp-auto/bitacora";
import { ENVIANDO_ABANDONADO_MS } from "@/lib/whatsapp-auto/reglas";
import { borrarSesion, tieneSesion } from "./auth-bd";
import { verificarLlave } from "./cifrado";
import { despacharCuenta } from "./despachador";
import { conProceso } from "./procesos";
import { programarRecordatorios } from "./programador";
import { Sesion, type ModoInicio } from "./sesion";

/**
 * Worker de WhatsApp: UN proceso para todas las cuentas (máximo 6), cada
 * una con su propia Sesion aislada. Habla con la app web solo por la BD:
 *  - lee las órdenes del monitor (CuentaWhatsApp.solicitud),
 *  - despacha la cola (MensajeWhatsApp),
 *  - programa recordatorios cada hora,
 *  - escribe su latido y limpia lo abandonado.
 */

const sesiones = new Map<string, Sesion>();
/** Última orden atendida por cuenta (solicitudEn), para no repetirla. */
const atendidas = new Map<string, number>();
/** Arranque escalonado: nunca reconectar todas las cuentas a la vez desde la misma IP. */
const colaArranque: { cuentaId: string; numero: string }[] = [];
const ESCALON_MIN_MS = 20_000;
const ESCALON_MAX_MS = 40_000;

const VERSION_BAILEYS = "6.7.24";
let cpuPrevio = process.cpuUsage();
let cpuPrevioEn = Date.now();
let detenido = false;

async function iniciarSesion(cuentaId: string, numero: string, modo: ModoInicio) {
  const previa = sesiones.get(cuentaId);
  if (previa) await previa.detener(false);
  const s = new Sesion(cuentaId, numero);
  sesiones.set(cuentaId, s);
  await s.iniciar(modo);
}

/** Aplica el estado deseado (BD) a las sesiones en memoria. */
async function reconciliar() {
  const cuentas = await prisma.cuentaWhatsApp.findMany();
  const vivas = new Set(cuentas.map((c) => c.id));

  for (const [id, s] of Array.from(sesiones)) {
    if (!vivas.has(id)) {
      await s.detener(false);
      sesiones.delete(id);
    }
  }

  for (const c of cuentas) {
    const marca = c.solicitudEn?.getTime() ?? 0;
    const nueva = c.solicitud !== "NINGUNA" && marca > (atendidas.get(c.id) ?? 0);
    const sesion = sesiones.get(c.id);

    if (nueva) {
      atendidas.set(c.id, marca);
      if (c.solicitud === "DESCONECTAR") {
        await sesion?.detener(true);
        sesiones.delete(c.id);
        await borrarSesion(c.id);
        await prisma.cuentaWhatsApp.update({
          where: { id: c.id },
          data: { estado: "DESCONECTADO", solicitud: "NINGUNA", qr: null, codigoVinculacion: null, waId: null },
        });
        await registrarBitacora({ cuentaId: c.id, tipo: "desvinculado" });
      } else {
        // Vincular de cero: se descarta cualquier sesión previa.
        await sesion?.detener(false);
        await borrarSesion(c.id);
        await iniciarSesion(c.id, c.numero, c.solicitud === "VINCULAR_QR" ? "qr" : "codigo");
        await registrarBitacora({ cuentaId: c.id, tipo: "vinculacion_iniciada", detalle: { modo: c.solicitud } });
      }
      continue;
    }

    // Sesión guardada sin conexión viva (arranque, o el administrador
    // reanudó una cuenta que estaba bloqueada): a la cola escalonada.
    const sinConexion = !sesion || (sesion.inactiva && !c.pausadaPorAdmin);
    if (
      sinConexion &&
      c.estado !== "BLOQUEADO" &&
      c.estado !== "ESPERANDO_VINCULACION" &&
      !colaArranque.some((x) => x.cuentaId === c.id) &&
      (await tieneSesion(c.id))
    ) {
      colaArranque.push({ cuentaId: c.id, numero: c.numero });
    }
  }
}

async function arrancarEscalonado() {
  while (!detenido) {
    const siguiente = colaArranque.shift();
    if (siguiente && !sesiones.has(siguiente.cuentaId)) {
      await iniciarSesion(siguiente.cuentaId, siguiente.numero, "normal").catch((e) =>
        registrarBitacora({ cuentaId: siguiente.cuentaId, tipo: "error_conexion", detalle: { mensaje: String(e) } })
      );
      await dormir(ESCALON_MIN_MS + Math.random() * (ESCALON_MAX_MS - ESCALON_MIN_MS));
    } else {
      await dormir(2_000);
    }
  }
}

async function despachar() {
  const control = await prisma.controlWhatsApp.findUnique({ where: { id: "global" } });
  const paro = control?.paroGlobal ?? false;
  await Promise.all(
    Array.from(sesiones.values()).map((s) =>
      despacharCuenta(s, paro).catch((e) =>
        registrarBitacora({ cuentaId: s.cuentaId, tipo: "error_despacho", detalle: { mensaje: String(e) } })
      )
    )
  );
}

async function latido() {
  const mem = process.memoryUsage();
  const ahora = Date.now();
  const cpu = process.cpuUsage(cpuPrevio);
  const cpuPct = ((cpu.user + cpu.system) / 1000 / Math.max(1, ahora - cpuPrevioEn)) * 100;
  cpuPrevio = process.cpuUsage();
  cpuPrevioEn = ahora;
  const latido = {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapMb: Math.round(mem.heapUsed / 1024 / 1024),
    cpuPct: Math.round(cpuPct * 10) / 10,
    uptimeS: Math.round(process.uptime()),
    versionBaileys: VERSION_BAILEYS,
    sesiones: Array.from(sesiones.values()).map((s) => ({ cuentaId: s.cuentaId, conectada: s.conectada })),
  };
  await prisma.controlWhatsApp.upsert({
    where: { id: "global" },
    create: { id: "global", latidoEn: new Date(), latido },
    update: { latidoEn: new Date(), latido },
  });
}

/** Lo que quedó ENVIANDO no se sabe si salió: se aparta para revisión, nunca se reintenta solo. */
async function limpieza(alArrancar: boolean): Promise<number> {
  const limite = alArrancar ? new Date() : new Date(Date.now() - ENVIANDO_ABANDONADO_MS);
  const r = await prisma.mensajeWhatsApp.updateMany({
    where: { estado: "ENVIANDO", actualizadoEn: { lt: limite } },
    data: { estado: "REVISAR", motivo: "El worker se detuvo a medio envío: no se sabe si salió" },
  });
  const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.bitacoraWhatsApp.deleteMany({ where: { creadoEn: { lt: hace90 } } });
  await prisma.procesoWhatsApp.deleteMany({ where: { inicio: { lt: hace30 } } });
  return r.count;
}

function cada(ms: number, fn: () => Promise<unknown>) {
  const vuelta = async () => {
    if (detenido) return;
    await fn().catch((e) => console.error(e));
    if (!detenido) setTimeout(vuelta, ms);
  };
  void vuelta();
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  verificarLlave();
  await prisma.controlWhatsApp.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} });
  await conProceso("limpieza", null, () => limpieza(true));
  await registrarBitacora({ tipo: "worker_iniciado" });

  void arrancarEscalonado();
  cada(3_000, reconciliar);
  cada(5_000, despachar);
  cada(30_000, latido);
  cada(60 * 60_000, () => programarRecordatorios());
  let ultimaLimpieza = new Date().getDate();
  cada(10 * 60_000, async () => {
    const ahora = new Date();
    if (ahora.getHours() === 3 && ahora.getDate() !== ultimaLimpieza) {
      ultimaLimpieza = ahora.getDate();
      await conProceso("limpieza", null, () => limpieza(false));
    }
  });
}

async function apagar() {
  detenido = true;
  // Sin logout: la sesión queda guardada y el siguiente arranque reconecta.
  await Promise.all(Array.from(sesiones.values()).map((s) => s.detener(false)));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void apagar());
process.on("SIGINT", () => void apagar());

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
