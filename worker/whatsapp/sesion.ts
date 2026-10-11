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

/**
 * Una conexión de Baileys para una CuentaWhatsApp. Aislada a propósito: un
 * error aquí (excepción, bloqueo, caída) no toca a las demás cuentas.
 */
export class Sesion {
  sock: WASocket | null = null;
  conectada = false;
  private intentos = 0;
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
    const version = await fetchLatestBaileysVersion()
      .then((v) => v.version)
      .catch(() => undefined);

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      browser: Browsers.ubuntu("Kredired"),
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
      this.intentos = 0;
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
      const codigo = (u.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      await registrarBitacora({ cuentaId: this.cuentaId, tipo: "desconectado", detalle: { codigo: codigo ?? null } });
      if (this.detenida) return;

      if (codigo === DisconnectReason.loggedOut) {
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

  private async alActualizarMensajes(updates: { key: { id?: string | null }; update: { status?: number | null } }[]) {
    for (const { key, update } of updates) {
      if (!key.id || update.status == null) continue;
      const ack = update.status >= 4 ? "LEIDO" : update.status === 3 ? "ENTREGADO" : update.status === 2 ? "ENVIADO" : null;
      if (!ack) continue;
      await prisma.envioWhatsApp.updateMany({
        where: { cuentaId: this.cuentaId, waMensajeId: key.id },
        data: { ack },
      });
    }
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
