import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mensajeCobro, mensajeReciboAbonoDeudor, type CobroContrata } from "@/lib/mensajes-whatsapp";
import { claveOperacionActual } from "./contexto-operacion";
import { normalizarTelefono } from "./telefono";
import { PRIORIDAD } from "./reglas";
import { registrarBitacora } from "./bitacora";

/**
 * Recibo automático de WhatsApp.
 *
 * REGLA: el cobro tiene prioridad y SIEMPRE se completa. El recibo nunca
 * puede hacerlo fallar:
 *  - todo lo que se prepara antes de guardar (leer la cuenta, armar el
 *    texto) va dentro de try/catch: si falla, el cobro se guarda igual y
 *    queda registrado "falló el envío automático" (monitor + pantalla);
 *  - si lo que falla es el INSERT del recibo dentro de la transacción, el
 *    cobro se vuelve a guardar sin él.
 *
 * Sin WhatsApp automático activo, el cobro se escribe exactamente igual que
 * antes de que existiera esto.
 *
 * La clave del recibo es la Idempotency-Key del cobro: así la pantalla que
 * lo hizo (o la Ruta, con el id de su cola) puede consultar si salió.
 */

type Escritura = Prisma.PrismaPromise<unknown>;

/**
 * Las escrituras se pasan como FUNCIONES que las crean: un PrismaPromise que
 * ya se ejecutó (aunque haya fallado) no se puede volver a usar, y para
 * reintentar el cobro sin el recibo hacen falta escrituras nuevas.
 */
type Escrituras = () => Escritura[];

export type ReciboPreparado =
  | { listo: true; escritura: () => Escritura; registrarFallo: (motivo: string) => Promise<void> }
  | { listo: false; registrarFallo: () => Promise<void> };

type Destinatario =
  | { clienteId: string; deudorId?: undefined; nombre: string; telefono: string | null }
  | { deudorId: string; clienteId?: undefined; nombre: string; telefono: string | null };

async function nombreAppDe(ownerId: string): Promise<string> {
  const conf = await prisma.configuracion.findUnique({ where: { ownerId }, select: { nombreApp: true } });
  return conf?.nombreApp ?? "Kredired";
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function registrarError(ownerId: string, motivo: string, contexto: Record<string, unknown>) {
  await prisma.errorLog
    .create({
      data: {
        origen: "whatsapp-recibo",
        ownerId,
        mensaje: `Falló el envío automático del recibo: ${motivo}`,
        contexto: JSON.parse(JSON.stringify(contexto)),
      },
    })
    .catch(() => undefined);
}

/** Null = no aplica (sin WhatsApp automático, sin teléfono o con baja). Nunca lanza. */
async function prepararRecibo(opts: {
  ownerId: string;
  destinatario: Destinatario;
  pagoIds?: string[];
  abonoDeudorId?: string;
  texto: (nombreApp: string) => string;
}): Promise<ReciboPreparado | null> {
  const clave = claveOperacionActual() ?? globalThis.crypto.randomUUID();
  const claveDedupe = `recibo:${clave}`;
  const contexto = { claveDedupe, destinatario: opts.destinatario.nombre, pagoIds: opts.pagoIds, abonoDeudorId: opts.abonoDeudorId };
  let cuenta: { id: string; ownerId: string } | null = null;
  let telefono: string | null = null;

  /** Deja constancia en el monitor (renglón FALLIDO, reintentable) y en ErrorLog. */
  const registrarFallo = async (motivo: string) => {
    await registrarError(opts.ownerId, motivo, contexto);
    if (!cuenta) return;
    await prisma.mensajeWhatsApp
      .createMany({
        data: [
          {
            cuentaId: cuenta.id,
            ownerId: cuenta.ownerId,
            tipo: "RECIBO",
            prioridad: PRIORIDAD.RECIBO,
            telefono: telefono ?? "",
            destinatarioNombre: opts.destinatario.nombre,
            clienteId: opts.destinatario.clienteId ?? null,
            deudorId: opts.destinatario.deudorId ?? null,
            pagoIds: opts.pagoIds ?? [],
            abonoDeudorId: opts.abonoDeudorId ?? null,
            claveDedupe,
            estado: "FALLIDO",
            motivo: `No se pudo preparar el recibo automático: ${motivo}`,
          },
        ],
        skipDuplicates: true,
      })
      .catch(() => undefined);
    await registrarBitacora({ cuentaId: cuenta.id, tipo: "error_recibo", detalle: { motivo, claveDedupe } });
  };

  try {
    telefono = normalizarTelefono(opts.destinatario.telefono);
    if (!telefono) return null;
    const c = await prisma.cuentaWhatsApp.findUnique({
      where: { ownerId: opts.ownerId },
      select: { id: true, ownerId: true, activo: true, recibos: true },
    });
    if (!c?.activo || !c.recibos) return null;
    cuenta = { id: c.id, ownerId: c.ownerId };
    const optOut = await prisma.optOutWhatsApp.findUnique({
      where: { cuentaId_telefono: { cuentaId: c.id, telefono } },
      select: { activo: true },
    });
    if (optOut?.activo) return null;

    const texto = opts.texto(await nombreAppDe(opts.ownerId));
    const data = {
      cuentaId: c.id,
      ownerId: c.ownerId,
      tipo: "RECIBO" as const,
      prioridad: PRIORIDAD.RECIBO,
      telefono,
      destinatarioNombre: opts.destinatario.nombre,
      clienteId: opts.destinatario.clienteId ?? null,
      deudorId: opts.destinatario.deudorId ?? null,
      pagoIds: opts.pagoIds ?? [],
      abonoDeudorId: opts.abonoDeudorId ?? null,
      claveDedupe,
      texto,
    };
    return {
      listo: true,
      escritura: () => prisma.mensajeWhatsApp.createMany({ data: [data], skipDuplicates: true }),
      registrarFallo,
    };
  } catch (e) {
    const motivo = mensajeDe(e);
    return { listo: false, registrarFallo: () => registrarFallo(motivo) };
  }
}

export function prepararReciboCobro(opts: {
  ownerId: string;
  cliente: { id: string; nombre: string; telefono: string | null };
  pagoIds: string[];
  /** Se evalúa dentro del try: un error calculando el recibo no tumba el cobro. */
  armar: () => { total: number; contratas: CobroContrata[] };
}): Promise<ReciboPreparado | null> {
  return prepararRecibo({
    ownerId: opts.ownerId,
    destinatario: { clienteId: opts.cliente.id, nombre: opts.cliente.nombre, telefono: opts.cliente.telefono },
    pagoIds: opts.pagoIds,
    texto: (nombreApp) => {
      const { total, contratas } = opts.armar();
      return mensajeCobro({ nombreApp, clienteNombre: opts.cliente.nombre, total, contratas });
    },
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
export async function revertirRecibos(ownerId: string, pagoIds: string[]): Promise<void> {
  // Aparte del cobro y sin poder hacerlo fallar: si esto no corre, el worker
  // igual lo cancela al revalidar el cobro antes de enviar.
  await prisma
    .$transaction([
      prisma.mensajeWhatsApp.updateMany({
        where: { ownerId, tipo: "RECIBO", estado: "PENDIENTE", pagoIds: { hasSome: pagoIds } },
        data: { estado: "CANCELADO", motivo: "Cobro revertido antes de enviarse" },
      }),
      prisma.mensajeWhatsApp.updateMany({
        where: { ownerId, tipo: "RECIBO", estado: { in: ["ENVIANDO", "ENVIADO", "REVISAR"] }, pagoIds: { hasSome: pagoIds } },
        data: { revertido: true },
      }),
    ])
    .catch(() => undefined);
}

/** Guarda como antes de existir el recibo automático: una escritura sola, sin transacción extra. */
async function escribir(escrituras: Escritura[]) {
  if (escrituras.length === 1) await escrituras[0];
  else await prisma.$transaction(escrituras);
}

/** El error vino del INSERT del recibo (FK o único), no del cobro. */
function esErrorDelRecibo(e: unknown): boolean {
  const err = e as { code?: string; meta?: unknown; message?: string };
  if (err?.code !== "P2003" && err?.code !== "P2002") return false;
  return /MensajeWhatsApp/.test(`${JSON.stringify(err.meta ?? "")} ${err.message ?? ""}`);
}

/**
 * Guarda el cobro y, si hay, su recibo en la misma transacción. El cobro
 * siempre se completa: si el recibo es lo que falla, se guarda sin él y se
 * registra la falla. Solo se reintenta cuando el error es del recibo — con
 * cualquier otro error (p. ej. la conexión se cayó a media respuesta) volver
 * a escribir podría cobrar dos veces.
 */
export async function guardarCobro(escrituras: Escrituras, recibo: ReciboPreparado | null): Promise<void> {
  if (!recibo) {
    await escribir(escrituras());
    return;
  }
  if (!recibo.listo) {
    await escribir(escrituras());
    await recibo.registrarFallo();
    return;
  }
  try {
    await prisma.$transaction([...escrituras(), recibo.escritura()]);
  } catch (e) {
    if (!esErrorDelRecibo(e)) throw e;
    await escribir(escrituras());
    await recibo.registrarFallo(mensajeDe(e));
    return;
  }
  // Despierta al worker para que el recibo salga en segundos, sin esperar su revisión periódica.
  await prisma.$executeRaw`SELECT pg_notify('whatsapp_salida', '')`.catch(() => undefined);
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
