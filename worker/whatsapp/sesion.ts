import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WAMessage,
  type WASocket,
} from "baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import { prisma } from "@/lib/prisma";
import { registrarBitacora } from "@/lib/whatsapp-auto/bitacora";
import { MOTIVO_SIN_ACUSE } from "@/lib/whatsapp-auto/reglas";
import { jidDe, normalizarTelefono, telefonoDeJid } from "@/lib/whatsapp-auto/telefono";
import { authDesdeBD, borrarSesion } from "./auth-bd";
import { procesarEntrante } from "./receptor";

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? "warn" });

export type ModoInicio = "normal" | "qr" | "codigo";

/** Reconexión con espera creciente: 5 s → 15 s → 1 min → 5 min (tope). */
const ESPERAS_MS = [5_000, 15_000, 60_000, 300_000];

/** WhatsApp respondió que la cuenta está restringida/vetada. */
const CODIGOS_CUENTA_RESTRINGIDA = new Set([403, 402]);

export class SinWhatsApp extends Error {}

/** Rechazos seguidos de WhatsApp tras los que la cuenta se pausa sola. */
const RECHAZOS_PARA_PAUSAR = 3;

/** La conexión debe llevar abierta esto para considerarla estable y reiniciar el backoff. */
const CONEXION_ESTABLE_MS = 60_000;

/** La versión de WhatsApp Web se pide una vez por hora, no en cada reconexión. */
let versionCache: { version: [number, number, number]; hasta: number } | null = null;
async function versionWhatsApp(): Promise<[number, number, number] | undefined> {
  if (versionCache && versionCache.hasta > Date.now()) return versionCache.version;
  const v = await fetchLatestBaileysVersion().catch(() => null);
  if (!v) return versionCache?.version;
  versionCache = { version: v.version as [number, number, number], hasta: Date.now() + 60 * 60_000 };
  return versionCache.version;
}

/** Caché mínima de reintentos de descifrado (misma forma que NodeCache). */
function cacheReintentos() {
  const m = new Map<string, number>();
  return {
    get: <T>(k: string) => m.get(k) as T | undefined,
    set: <T>(k: string, v: T) => void m.set(k, v as number),
    del: (k: string) => void m.delete(k),
    flushAll: () => m.clear(),
  };
}

/** Motivo legible del cierre: el conflicto (`device_removed`, `replaced`…) viene dentro de `data`. */
function motivoCierre(error: Error | undefined): string | null {
  if (!error) return null;
  const data = (error as Boom).data as { tag?: string; content?: { tag?: string; attrs?: { type?: string } }[] } | undefined;
  const hijo = Array.isArray(data?.content) ? data.content[0] : undefined;
  const detalle = hijo?.attrs?.type ?? hijo?.tag;
  return [error.message, detalle].filter(Boolean).join(" · ") || null;
}

/**
 * Una conexión de Baileys para una CuentaWhatsApp. Aislada a propósito: un
 * error aquí (excepción, bloqueo, caída) no toca a las demás cuentas.
 */
export class Sesion {
  sock: WASocket | null = null;
  conectada = false;
  private intentos = 0;
  private abiertaDesde: number | null = null;
  private rechazados = new Map<string, string>();
  private rechazosSeguidos = 0;
  private reconexion: NodeJS.Timeout | null = null;
  private detenida = false;
  private iniciando = false;
  private codigoPedido = false;
  private jids = new Map<string, { jid: string | null; hasta: number }>();

  constructor(
    readonly cuentaId: string,
    readonly numero: string
  ) {}

  async iniciar(modo: ModoInicio) {
    this.detenida = false;
    this.codigoPedido = false;
    this.iniciando = true;
    try {
      await this.conectar(modo);
    } finally {
      this.iniciando = false;
    }
  }

  private async conectar(modo: ModoInicio) {
    const { state, guardarCreds } = await authDesdeBD(this.cuentaId);
    const version = await versionWhatsApp();

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      browser: Browsers.macOS("Desktop"),
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 120_000,
      msgRetryCounterCache: cacheReintentos(),
      // Si el cliente pide reenviar (falló descifrar), se responde con lo que ya mandamos.
      getMessage: async (key) => {
        if (!key.id) return undefined;
        const envio = await prisma.envioWhatsApp.findFirst({
          where: { cuentaId: this.cuentaId, waMensajeId: key.id },
          select: { texto: true },
        });
        return envio ? { conversation: envio.texto } : undefined;
      },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", () => void guardarCreds().catch((e) => logger.error(e)));

    sock.ev.on("connection.update", (u) => {
      void this.alActualizarConexion(sock, modo, u).catch((e) => logger.error(e));
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) void this.alRecibir(m).catch((e) => logger.error(e));
    });

    sock.ev.on("messages.update", (updates) => {
      void this.alActualizarMensajes(updates).catch((e) => logger.error(e));
    });
  }

  private async alActualizarConexion(
    sock: WASocket,
    modo: ModoInicio,
    u: Partial<{ connection: string; qr: string; lastDisconnect: { error?: Error } }>
  ) {
    // Un socket viejo que se cierra tarde no debe tumbar al nuevo.
    if (this.sock !== sock) return;
    if (u.qr) {
      if (modo === "qr") {
        await prisma.cuentaWhatsApp.update({
          where: { id: this.cuentaId },
          data: { qr: u.qr, estado: "ESPERANDO_VINCULACION", vinculacionExpira: new Date(Date.now() + 60_000) },
        });
      } else if (modo === "codigo" && !this.codigoPedido) {
        this.codigoPedido = true;
        const codigo = await sock.requestPairingCode(this.numero);
        await prisma.cuentaWhatsApp.update({
          where: { id: this.cuentaId },
          data: {
            codigoVinculacion: codigo,
            qr: null,
            estado: "ESPERANDO_VINCULACION",
            vinculacionExpira: new Date(Date.now() + 3 * 60_000),
          },
        });
        await registrarBitacora({ cuentaId: this.cuentaId, tipo: "codigo_generado" });
      } else if (modo === "normal") {
        // Sin sesión válida no se debe mostrar QR a nadie: se cierra y se
        // espera a que el monitor pida vincular.
        await this.detener(false);
        await prisma.cuentaWhatsApp.update({
          where: { id: this.cuentaId },
          data: { estado: "DESCONECTADO", ultimoError: "Sesión no válida: vuelve a vincular desde el monitor" },
        });
      }
      return;
    }

    if (u.connection === "open") {
      const vinculado = telefonoDeJid(sock.user?.id);
      if (vinculado !== this.numero) {
        await registrarBitacora({
          cuentaId: this.cuentaId,
          tipo: "numero_no_coincide",
          detalle: { esperado: this.numero, vinculado },
        });
        await sock.logout().catch(() => undefined);
        await this.detener(false);
        await borrarSesion(this.cuentaId);
        await prisma.cuentaWhatsApp.update({
          where: { id: this.cuentaId },
          data: {
            estado: "DESCONECTADO",
            solicitud: "NINGUNA",
            qr: null,
            codigoVinculacion: null,
            ultimoError: `Se vinculó ${vinculado ?? "otro número"} en vez de ${this.numero}: se desconectó.`,
          },
        });
        return;
      }
      this.conectada = true;
      this.abiertaDesde = Date.now();
      await prisma.cuentaWhatsApp.update({
        where: { id: this.cuentaId },
        data: {
          estado: "CONECTADO",
          solicitud: "NINGUNA",
          qr: null,
          codigoVinculacion: null,
          vinculacionExpira: null,
          waId: sock.user?.id ?? null,
          conectadoDesde: new Date(),
          ultimaConexion: new Date(),
          ultimoError: null,
        },
      });
      await registrarBitacora({ cuentaId: this.cuentaId, tipo: "conectado" });
      return;
    }

    if (u.connection === "close") {
      this.conectada = false;
      this.sock = null;
      if (this.abiertaDesde && Date.now() - this.abiertaDesde > CONEXION_ESTABLE_MS) this.intentos = 0;
      this.abiertaDesde = null;
      const codigo = (u.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const motivo = motivoCierre(u.lastDisconnect?.error);
      await registrarBitacora({
        cuentaId: this.cuentaId,
        tipo: "desconectado",
        detalle: { codigo: codigo ?? null, motivo, intentos: this.intentos },
      });
      if (this.detenida) return;

      if (codigo === DisconnectReason.loggedOut) {
        // WhatsApp cerró la sesión (no fuimos nosotros): queda constancia para el aviso al monitor.
        await registrarBitacora({
          cuentaId: this.cuentaId,
          tipo: "sesion_cerrada_por_whatsapp",
          detalle: { codigo, motivo },
        });
        await borrarSesion(this.cuentaId);
        await prisma.cuentaWhatsApp.update({
          where: { id: this.cuentaId },
          data: {
            estado: "DESCONECTADO",
            ultimoError: "WhatsApp cerró la sesión (dispositivo desvinculado). Vuelve a vincular desde el monitor.",
          },
        });
        return;
      }
      if (codigo === DisconnectReason.connectionReplaced) {
        // Otra instancia usa la misma sesión: reconectar solo las expulsaría en bucle.
        await registrarBitacora({ cuentaId: this.cuentaId, tipo: "sesion_cerrada_por_whatsapp", detalle: { codigo, motivo } });
        await prisma.cuentaWhatsApp.update({
          where: { id: this.cuentaId },
          data: { estado: "DESCONECTADO", ultimoError: "La sesión se abrió en otro lugar (conexión reemplazada). Revisa que no haya dos workers." },
        });
        return;
      }
      if (codigo !== undefined && CODIGOS_CUENTA_RESTRINGIDA.has(codigo)) {
        await marcarRestringida(this.cuentaId, `WhatsApp respondió ${codigo}: cuenta restringida`);
        return;
      }
      if (codigo === DisconnectReason.restartRequired) {
        // Normal justo después de vincular: se reconecta de inmediato.
        await this.iniciar("normal");
        return;
      }
      if (modo !== "normal" && this.intentos >= 3) {
        // Nadie escaneó el QR / escribió el código: se deja de intentar
        // hasta que el monitor lo vuelva a pedir.
        await this.detener(false);
        await prisma.cuentaWhatsApp.update({
          where: { id: this.cuentaId },
          data: {
            estado: "DESCONECTADO",
            solicitud: "NINGUNA",
            qr: null,
            codigoVinculacion: null,
            ultimoError: "La vinculación expiró sin completarse. Vuelve a generarla.",
          },
        });
        return;
      }
      await prisma.cuentaWhatsApp.update({
        where: { id: this.cuentaId },
        data: { estado: modo === "normal" ? "DESCONECTADO" : "ESPERANDO_VINCULACION", ultimoError: `Conexión cerrada (${codigo ?? "?"})` },
      });
      const espera = ESPERAS_MS[Math.min(this.intentos, ESPERAS_MS.length - 1)];
      this.intentos++;
      this.reconexion = setTimeout(() => {
        this.reconexion = null;
        void this.iniciar(modo === "codigo" ? "normal" : modo);
      }, espera);
    }
  }

  private async alRecibir(m: WAMessage) {
    if (m.key.fromMe) return;
    const jid = m.key.remoteJid ?? "";
    if (jid.endsWith("@g.us") || jid === "status@broadcast") return;
    const telefono = jid.endsWith("@s.whatsapp.net") ? telefonoDeJid(jid) : telefonoDeJid(m.key.senderPn);
    if (!telefono) return;
    const texto = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? null;
    await procesarEntrante(this.cuentaId, telefono, texto);
  }

  /** WhatsApp devolvió error para ese mensaje (el acuse llegó antes de guardar el envío). */
  rechazoDe(waMensajeId: string | null): string | null {
    return waMensajeId ? (this.rechazados.get(waMensajeId) ?? null) : null;
  }

  /**
   * El servidor de WhatsApp NO aceptó el mensaje: no le llegó a nadie. Se
   * marca FALLIDO (reintentable desde el monitor) en vez de dejarlo como
   * enviado. Varios seguidos = la cuenta está limitada: se pausa sola para no
   * seguir insistiendo, que es lo que termina en un bloqueo.
   */
  private async alRechazar(waMensajeId: string, error: string) {
    const motivo = `WhatsApp rechazó el mensaje (error ${error}): no se entregó`;
    this.rechazados.set(waMensajeId, motivo);
    if (this.rechazados.size > 200) this.rechazados.delete(this.rechazados.keys().next().value as string);
    await marcarEnvioRechazado(this.cuentaId, waMensajeId, motivo);
    await registrarBitacora({ cuentaId: this.cuentaId, tipo: "mensaje_rechazado", detalle: { waMensajeId, error } });
    this.rechazosSeguidos++;
    if (this.rechazosSeguidos >= RECHAZOS_PARA_PAUSAR) {
      this.rechazosSeguidos = 0;
      await marcarRestringida(
        this.cuentaId,
        `WhatsApp rechazó ${RECHAZOS_PARA_PAUSAR} mensajes seguidos (error ${error}): el número parece limitado. Revisa WhatsApp en el teléfono antes de reanudar.`
      );
    }
  }

  private async alActualizarMensajes(
    updates: { key: { id?: string | null }; update: { status?: number | null; messageStubParameters?: unknown[] | null } }[]
  ) {
    for (const { key, update } of updates) {
      if (!key.id || update.status == null) continue;
      if (update.status === 0) {
        await this.alRechazar(key.id, String(update.messageStubParameters?.[0] ?? "?"));
        continue;
      }
      if (update.status >= 2) this.rechazosSeguidos = 0;
      const ack = update.status >= 4 ? "LEIDO" : update.status === 3 ? "ENTREGADO" : update.status === 2 ? "ENVIADO" : null;
      if (!ack) continue;
      await prisma.envioWhatsApp.updateMany({
        where: { cuentaId: this.cuentaId, waMensajeId: key.id },
        data: { ack },
      });
      // El acuse llegó tarde (p. ej. tras un corte): lo que se había apartado
      // por falta de acuse sí salió. Vuelve a "Enviado" para que nadie lo reenvíe.
      await prisma.mensajeWhatsApp.updateMany({
        where: { cuentaId: this.cuentaId, estado: "REVISAR", motivo: MOTIVO_SIN_ACUSE, envio: { waMensajeId: key.id } },
        data: { estado: "ENVIADO", motivo: null },
      });
    }
  }

  /** La bandera dice conectada pero el WebSocket ya no está abierto (socket "zombi"). */
  get zombi(): boolean {
    const ws = this.sock?.ws as { isOpen?: boolean } | undefined;
    return this.conectada && ws?.isOpen === false;
  }

  /** Cierra el socket para que el evento `close` dispare la reconexión normal. */
  forzarCierre(motivo: string) {
    this.sock?.end(new Error(motivo));
  }

  /** Sin conexión ni reconexión programada (bloqueada, desvinculada o detenida). */
  get inactiva(): boolean {
    return !this.sock && !this.reconexion && !this.iniciando;
  }

  /** Devuelve el id del mensaje en WhatsApp. Lanza SinWhatsApp si el número no tiene cuenta. */
  async enviar(telefono: string, texto: string): Promise<string | null> {
    const sock = this.sock;
    if (!sock || !this.conectada) throw new Error("Connection Closed");
    const jid = await this.resolverJid(sock, telefono);
    if (!jid) throw new SinWhatsApp(`${telefono} no tiene WhatsApp`);
    const enviado = await sock.sendMessage(jid, { text: texto });
    return enviado?.key.id ?? null;
  }

  private async resolverJid(sock: WASocket, telefono: string): Promise<string | null> {
    const t = normalizarTelefono(telefono);
    if (!t) return null;
    const cache = this.jids.get(t);
    if (cache && cache.hasta > Date.now()) return cache.jid;
    const [r] = (await sock.onWhatsApp(jidDe(t))) ?? [];
    const jid = r?.exists ? r.jid : null;
    this.jids.set(t, { jid, hasta: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    return jid;
  }

  /** `cerrarSesion`: además desvincula el dispositivo en WhatsApp. */
  async detener(cerrarSesion: boolean) {
    this.detenida = true;
    if (this.reconexion) clearTimeout(this.reconexion);
    this.reconexion = null;
    const sock = this.sock;
    this.sock = null;
    this.conectada = false;
    if (!sock) return;
    if (cerrarSesion) await sock.logout().catch(() => undefined);
    else sock.end(undefined);
  }
}

/** El envío ya guardado resultó rechazado por WhatsApp: sus mensajes pasan a FALLIDO. */
export async function marcarEnvioRechazado(cuentaId: string, waMensajeId: string, motivo: string) {
  await prisma.mensajeWhatsApp.updateMany({
    where: { cuentaId, estado: "ENVIADO", envio: { waMensajeId } },
    data: { estado: "FALLIDO", motivo },
  });
}

/** Pausa la cuenta y su campaña: solo el administrador la reanuda. */
export async function marcarRestringida(cuentaId: string, motivo: string) {
  await prisma.$transaction([
    prisma.cuentaWhatsApp.update({
      where: { id: cuentaId },
      data: {
        estado: "BLOQUEADO",
        pausadaPorAdmin: true,
        pausadaPorAdminEn: new Date(),
        pausaMotivo: motivo,
        ultimoError: motivo,
      },
    }),
    prisma.campanaWhatsApp.updateMany({
      where: { cuentaId, estado: "ACTIVA" },
      data: { estado: "PAUSADA", pausaMotivo: motivo },
    }),
  ]);
  await registrarBitacora({ cuentaId, tipo: "alerta_restringida", detalle: { motivo } });
}
