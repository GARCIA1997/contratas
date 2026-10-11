import { startOfDay } from "date-fns";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { saldoActual } from "@/lib/services/deudores";
import { registrarBitacora } from "./bitacora";
import { normalizarTelefono } from "./telefono";
import { CUPO_DIARIO, PRIORIDAD } from "./reglas";

/**
 * Acciones y datos del monitor (solo administrador de la plataforma). El
 * worker ejecuta lo que requiere WhatsApp leyendo `solicitud`; aquí solo se
 * escribe el estado deseado.
 */

export const MAX_CUENTAS = 6;

/* ── Cuentas ─────────────────────────────────────────────────────────── */

export async function crearCuenta(ownerId: string, numero: string, actor: string) {
  const tel = normalizarTelefono(numero);
  if (!tel) throw new HttpError(400, "Número inválido (10 dígitos o con lada de país)");
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, workspaceOwnerId: true } });
  if (!owner || owner.workspaceOwnerId) throw new HttpError(400, "El usuario debe ser dueño de su espacio");
  if ((await prisma.cuentaWhatsApp.count()) >= MAX_CUENTAS) {
    throw new HttpError(400, `Máximo ${MAX_CUENTAS} números`);
  }
  if (await prisma.cuentaWhatsApp.findFirst({ where: { OR: [{ ownerId }, { numero: tel }] } })) {
    throw new HttpError(409, "Ese usuario ya tiene número o ese número ya está asignado");
  }
  const cuenta = await prisma.cuentaWhatsApp.create({ data: { ownerId, numero: tel } });
  await registrarBitacora({ cuentaId: cuenta.id, tipo: "cuenta_creada", detalle: { numero: tel, ownerId }, actor });
  return cuenta;
}

/**
 * Otro número para el mismo usuario: se desvincula el anterior, se cancela
 * lo pendiente y el número nuevo empieza de cero (calentamiento y
 * presentación propios). Los opt-out se conservan: la persona le dijo que
 * no a este usuario, no a un número.
 */
export async function cambiarNumero(cuentaId: string, numero: string, actor: string) {
  const tel = normalizarTelefono(numero);
  if (!tel) throw new HttpError(400, "Número inválido");
  const otra = await prisma.cuentaWhatsApp.findFirst({ where: { numero: tel, NOT: { id: cuentaId } } });
  if (otra) throw new HttpError(409, "Ese número ya está asignado a otro usuario");
  const ahora = new Date();
  await prisma.$transaction([
    prisma.cuentaWhatsApp.update({
      where: { id: cuentaId },
      data: {
        numero: tel,
        solicitud: "DESCONECTAR",
        solicitudEn: ahora,
        activo: false,
        qr: null,
        codigoVinculacion: null,
        waId: null,
      },
    }),
    prisma.mensajeWhatsApp.updateMany({
      where: { cuentaId, estado: "PENDIENTE" },
      data: { estado: "CANCELADO", motivo: "Cambio de número" },
    }),
    prisma.presentacionWhatsApp.deleteMany({ where: { cuentaId } }),
    prisma.campanaWhatsApp.updateMany({
      where: { cuentaId, estado: { in: ["ACTIVA", "PAUSADA"] } },
      data: { estado: "TERMINADA", terminadaEn: ahora, pausaMotivo: "Cambio de número" },
    }),
  ]);
  await registrarBitacora({ cuentaId, tipo: "numero_cambiado", detalle: { numero: tel }, actor });
}

export async function eliminarCuenta(cuentaId: string, actor: string) {
  // El worker detecta que ya no existe y cierra la sesión; las llaves se van en cascada.
  await prisma.cuentaWhatsApp.delete({ where: { id: cuentaId } });
  await registrarBitacora({ tipo: "cuenta_eliminada", detalle: { cuentaId }, actor });
}

export async function solicitar(
  cuentaId: string,
  solicitud: "VINCULAR_QR" | "VINCULAR_CODIGO" | "DESCONECTAR",
  actor: string
) {
  await prisma.cuentaWhatsApp.update({
    where: { id: cuentaId },
    data: {
      solicitud,
      solicitudEn: new Date(),
      qr: null,
      codigoVinculacion: null,
      ultimoError: null,
      ...(solicitud === "DESCONECTAR" ? {} : { estado: "ESPERANDO_VINCULACION" as const }),
    },
  });
  await registrarBitacora({ cuentaId, tipo: `solicitud_${solicitud.toLowerCase()}`, actor });
}

export async function pausarComoAdmin(cuentaId: string, pausada: boolean, actor: string) {
  const cuenta = await prisma.cuentaWhatsApp.findUniqueOrThrow({ where: { id: cuentaId } });
  await prisma.cuentaWhatsApp.update({
    where: { id: cuentaId },
    data: {
      pausadaPorAdmin: pausada,
      pausadaPorAdminEn: pausada ? new Date() : null,
      pausaMotivo: pausada ? `Pausado por ${actor}` : null,
      // Reanudar una cuenta bloqueada la deja lista para volver a conectar.
      ...(!pausada && cuenta.estado === "BLOQUEADO" ? { estado: "DESCONECTADO" as const } : {}),
    },
  });
  await registrarBitacora({ cuentaId, tipo: pausada ? "pausa_admin" : "reanudar_admin", actor });
}

export async function paroGlobal(activo: boolean, actor: string) {
  await prisma.controlWhatsApp.upsert({
    where: { id: "global" },
    create: { id: "global", paroGlobal: activo, paroPor: actor, paroEn: new Date() },
    update: { paroGlobal: activo, paroPor: actor, paroEn: new Date() },
  });
  await registrarBitacora({ tipo: activo ? "paro_global" : "paro_global_quitado", actor });
}

/* ── Mensajes ────────────────────────────────────────────────────────── */

export async function cancelarMensaje(id: string, actor: string) {
  const r = await prisma.mensajeWhatsApp.updateMany({
    where: { id, estado: { in: ["PENDIENTE", "FALLIDO", "REVISAR"] } },
    data: { estado: "CANCELADO", motivo: `Cancelado por ${actor}` },
  });
  if (r.count === 0) throw new HttpError(409, "El mensaje ya no se puede cancelar");
}

/** Solo FALLIDO o REVISAR (este último: el administrador confirmó que no salió). */
export async function reintentarMensaje(id: string, actor: string) {
  // Solo se reenvía el MENSAJE: el cobro ya quedó guardado y no se toca.
  const m = await prisma.mensajeWhatsApp.findUnique({ where: { id }, select: { tipo: true, texto: true } });
  if (m?.tipo === "RECIBO" && !m.texto) {
    throw new HttpError(409, "Este recibo no se pudo preparar, no hay texto que reenviar: mándalo a mano desde la app");
  }
  const r = await prisma.mensajeWhatsApp.updateMany({
    where: { id, estado: { in: ["FALLIDO", "REVISAR"] } },
    data: { estado: "PENDIENTE", motivo: `Reintento por ${actor}`, programadoPara: new Date() },
  });
  if (r.count === 0) throw new HttpError(409, "Solo se reintentan mensajes fallidos o por revisar");
}

export async function atenderRevertido(id: string) {
  await prisma.mensajeWhatsApp.update({ where: { id }, data: { revertido: false } });
}

export async function reactivarOptOut(cuentaId: string, telefono: string, actor: string) {
  await prisma.optOutWhatsApp.update({
    where: { cuentaId_telefono: { cuentaId, telefono } },
    data: { activo: false, reactivadoEn: new Date() },
  });
  await registrarBitacora({ cuentaId, tipo: "opt_out_reactivado", detalle: { telefono }, actor });
}

/* ── Campaña de presentación ─────────────────────────────────────────── */

export type DestinatarioPresentacion = {
  telefono: string;
  nombre: string;
  clienteId?: string;
  deudorId?: string;
  ultimoPago: Date | null;
};

/**
 * Clientes con al menos una contrata activa (cuota sin pagar, no pasada a
 * deuda) y deudores con saldo, con teléfono, sin opt-out y sin presentar.
 * Un mensaje por teléfono. Primero quienes pagaron más recientemente: ya
 * reconocen el negocio y responden, lo que da reputación al número.
 */
export async function destinatariosPresentacion(cuentaId: string): Promise<DestinatarioPresentacion[]> {
  const cuenta = await prisma.cuentaWhatsApp.findUniqueOrThrow({ where: { id: cuentaId } });
  const [bajas, presentados] = await Promise.all([
    prisma.optOutWhatsApp.findMany({ where: { cuentaId, activo: true }, select: { telefono: true } }),
    prisma.presentacionWhatsApp.findMany({ where: { cuentaId }, select: { telefono: true } }),
  ]);
  const excluidos = new Set([...bajas, ...presentados].map((x) => x.telefono));

  const clientes = await prisma.cliente.findMany({
    where: {
      ownerId: cuenta.ownerId,
      telefono: { not: null },
      contratas: { some: { convertidaADeuda: false, pagos: { some: { pagado: false } } } },
    },
    select: {
      id: true,
      nombre: true,
      telefono: true,
      contratas: { select: { pagos: { select: { fechaPago: true }, where: { fechaPago: { not: null } }, orderBy: { fechaPago: "desc" }, take: 1 } } },
    },
  });
  const deudores = await prisma.deudor.findMany({
    where: { ownerId: cuenta.ownerId, telefono: { not: null } },
    include: { abonos: { orderBy: { fecha: "asc" } } },
  });

  const porTelefono = new Map<string, DestinatarioPresentacion>();
  for (const c of clientes) {
    const tel = normalizarTelefono(c.telefono);
    if (!tel || excluidos.has(tel) || porTelefono.has(tel)) continue;
    const fechas = c.contratas.flatMap((k) => k.pagos.map((p) => p.fechaPago!));
    const ultimoPago = fechas.length ? fechas.reduce((a, b) => (b > a ? b : a)) : null;
    porTelefono.set(tel, { telefono: tel, nombre: c.nombre, clienteId: c.id, ultimoPago });
  }
  for (const d of deudores) {
    const tel = normalizarTelefono(d.telefono);
    if (!tel || excluidos.has(tel) || porTelefono.has(tel) || saldoActual(d) <= 0) continue;
    porTelefono.set(tel, { telefono: tel, nombre: d.nombre, deudorId: d.id, ultimoPago: d.abonos.at(-1)?.fecha ?? null });
  }
  return Array.from(porTelefono.values()).sort(
    (a, b) => (b.ultimoPago?.getTime() ?? 0) - (a.ultimoPago?.getTime() ?? 0)
  );
}

export async function iniciarCampana(cuentaId: string, totalConfirmado: number, actor: string) {
  const cuenta = await prisma.cuentaWhatsApp.findUniqueOrThrow({ where: { id: cuentaId } });
  if (cuenta.estado !== "CONECTADO") throw new HttpError(400, "El número debe estar conectado");
  if (await prisma.campanaWhatsApp.findFirst({ where: { cuentaId, estado: { in: ["ACTIVA", "PAUSADA"] } } })) {
    throw new HttpError(409, "Ya hay una campaña en curso para este número");
  }
  const lista = await destinatariosPresentacion(cuentaId);
  // La lista cambió desde que se mostró al administrador: que la vuelva a ver.
  if (lista.length !== totalConfirmado) {
    throw new HttpError(409, `La lista cambió (${lista.length} destinatarios). Revísala de nuevo.`);
  }
  if (lista.length === 0) throw new HttpError(400, "No hay destinatarios");
  return encolarCampana({ cuentaId, ownerId: cuenta.ownerId, lista, actor });
}

const claveDePresentacion = (cuentaId: string, telefono: string) => `presentacion:${cuentaId}:${telefono}`;

/**
 * Crea la campaña y encola un mensaje por destinatario.
 *
 * La clave `presentacion:{cuenta}:{teléfono}` es única, así que un mensaje
 * de una campaña anterior que se terminó (CANCELADO) seguiría ocupándola y
 * `createMany` lo omitiría en silencio: la campaña nueva se quedaba sin
 * mensajes y terminaba en segundos. Por eso:
 *  - los CANCELADO de esos teléfonos se reactivan (vuelven a PENDIENTE en
 *    esta campaña);
 *  - ENVIADO, ENVIANDO, REVISAR y FALLIDO no se tocan (no repetir algo que
 *    pudo haber llegado, ni reintentar solo un número sin WhatsApp);
 *  - si con destinatarios no entra ninguno a la cola, la campaña queda en
 *    ERROR y en la bitácora, nunca TERMINADA en silencio.
 */
export async function encolarCampana(opts: {
  cuentaId: string;
  ownerId: string;
  lista: DestinatarioPresentacion[];
  actor: string;
}) {
  const { cuentaId, ownerId, lista, actor } = opts;
  const resultado = await prisma.$transaction(async (tx) => {
    const campana = await tx.campanaWhatsApp.create({
      data: { cuentaId, total: lista.length, iniciadaPor: actor },
    });
    const claves = lista.map((d) => claveDePresentacion(cuentaId, d.telefono));
    const previos = await tx.mensajeWhatsApp.findMany({
      where: { cuentaId, tipo: "PRESENTACION", claveDedupe: { in: claves } },
      select: { id: true, claveDedupe: true, estado: true },
    });
    const porClave = new Map(previos.map((m) => [m.claveDedupe, m]));

    let reactivados = 0;
    const nuevos = [];
    const omitidos: { telefono: string; estado: string }[] = [];
    for (let i = 0; i < lista.length; i++) {
      const d = lista[i];
      const clave = claveDePresentacion(cuentaId, d.telefono);
      const previo = porClave.get(clave);
      if (!previo) {
        nuevos.push({
          cuentaId,
          ownerId,
          tipo: "PRESENTACION" as const,
          prioridad: PRIORIDAD.PRESENTACION,
          telefono: d.telefono,
          destinatarioNombre: d.nombre,
          clienteId: d.clienteId ?? null,
          deudorId: d.deudorId ?? null,
          campanaId: campana.id,
          orden: i,
          claveDedupe: clave,
        });
      } else if (previo.estado === "CANCELADO") {
        await tx.mensajeWhatsApp.update({
          where: { id: previo.id },
          data: {
            estado: "PENDIENTE",
            campanaId: campana.id,
            orden: i,
            destinatarioNombre: d.nombre,
            clienteId: d.clienteId ?? null,
            deudorId: d.deudorId ?? null,
            motivo: null,
            envioId: null,
            programadoPara: new Date(),
          },
        });
        reactivados++;
      } else {
        omitidos.push({ telefono: d.telefono, estado: previo.estado });
      }
    }
    const creados = nuevos.length
      ? (await tx.mensajeWhatsApp.createMany({ data: nuevos, skipDuplicates: true })).count
      : 0;
    const encolados = creados + reactivados;

    if (encolados === 0) {
      const motivo = `Error: ${lista.length} destinatario(s) pero no se encoló ningún mensaje`;
      await tx.campanaWhatsApp.update({
        where: { id: campana.id },
        data: { estado: "ERROR", pausaMotivo: motivo, terminadaEn: new Date() },
      });
      return { campanaId: campana.id, estado: "ERROR" as const, encolados, creados, reactivados, omitidos, motivo };
    }
    // El total es lo que de verdad quedó en la cola: así "enviados / total" cuadra.
    if (encolados !== lista.length) {
      await tx.campanaWhatsApp.update({ where: { id: campana.id }, data: { total: encolados } });
    }
    return { campanaId: campana.id, estado: "ACTIVA" as const, encolados, creados, reactivados, omitidos, motivo: null };
  });

  const detalle = {
    campanaId: resultado.campanaId,
    destinatarios: lista.length,
    encolados: resultado.encolados,
    nuevos: resultado.creados,
    reactivados: resultado.reactivados,
    omitidos: resultado.omitidos.length,
  };
  if (resultado.estado === "ERROR") {
    await registrarBitacora({ cuentaId, tipo: "alerta_campana_sin_mensajes", detalle: { ...detalle, motivo: resultado.motivo }, actor });
    throw new HttpError(409, `${resultado.motivo}. Revisa la bitácora del número.`);
  }
  await registrarBitacora({ cuentaId, tipo: "campana_iniciada", detalle, actor });
  return resultado;
}

export async function cambiarEstadoCampana(campanaId: string, accion: "pausar" | "reanudar" | "terminar", actor: string) {
  const campana = await prisma.campanaWhatsApp.findUniqueOrThrow({ where: { id: campanaId } });
  if (accion === "terminar") {
    await prisma.$transaction([
      prisma.campanaWhatsApp.update({
        where: { id: campanaId },
        data: { estado: "TERMINADA", terminadaEn: new Date(), pausaMotivo: `Terminada por ${actor}` },
      }),
      prisma.mensajeWhatsApp.updateMany({
        where: { campanaId, estado: "PENDIENTE" },
        data: { estado: "CANCELADO", motivo: "Campaña terminada" },
      }),
    ]);
  } else {
    await prisma.campanaWhatsApp.update({
      where: { id: campanaId },
      data: accion === "pausar" ? { estado: "PAUSADA", pausaMotivo: `Pausada por ${actor}` } : { estado: "ACTIVA", pausaMotivo: null },
    });
  }
  await registrarBitacora({ cuentaId: campana.cuentaId, tipo: `campana_${accion}`, actor });
}

/* ── Datos del panel ─────────────────────────────────────────────────── */

const LATIDO_MAX_MS = 2 * 60_000;
const SESION_CAIDA_MS = 10 * 60_000;
const MEMORIA_ALTA_MB = 300;

export type Alerta = { nivel: "error" | "aviso" | "info"; texto: string; cuentaId?: string };

export async function panelWhatsApp(cuentaSeleccionada?: string) {
  const ahora = Date.now();
  const hoy = startOfDay(new Date());
  const [control, cuentas, usuarios] = await Promise.all([
    prisma.controlWhatsApp.findUnique({ where: { id: "global" } }),
    prisma.cuentaWhatsApp.findMany({
      orderBy: { creadoEn: "asc" },
      include: { owner: { select: { id: true, nombre: true, email: true } } },
    }),
    prisma.user.findMany({
      where: { workspaceOwnerId: null, cuentaWhatsApp: null },
      select: { id: true, nombre: true, email: true },
      orderBy: { email: "asc" },
    }),
  ]);
  const latido = control?.latido as
    | { rssMb: number; heapMb: number; cpuPct: number; uptimeS: number; versionBaileys: string; huella?: string; iniciado?: string }
    | undefined;
  // Huella del código que usa el worker: la de esta app (al construirse) contra
  // la que reporta el worker (al arrancar). Ver worker/whatsapp/huella.mjs.
  const huellaApp = process.env.WHATSAPP_HUELLA_APP ?? null;
  const huellaWorker = latido?.huella ?? null;
  const workerVivo = Boolean(control?.latidoEn && ahora - control.latidoEn.getTime() < LATIDO_MAX_MS);

  const filas = await Promise.all(
    cuentas.map(async (c) => {
      const [enviadosHoy, pendientes, fallidosHoy, revisar, campana, recibosFallidos] = await Promise.all([
        prisma.envioWhatsApp.count({ where: { cuentaId: c.id, enviadoEn: { gte: hoy } } }),
        prisma.mensajeWhatsApp.count({ where: { cuentaId: c.id, estado: "PENDIENTE" } }),
        prisma.mensajeWhatsApp.count({ where: { cuentaId: c.id, estado: "FALLIDO", actualizadoEn: { gte: hoy } } }),
        prisma.mensajeWhatsApp.count({ where: { cuentaId: c.id, estado: "REVISAR" } }),
        prisma.campanaWhatsApp.findFirst({ where: { cuentaId: c.id }, orderBy: { iniciadaEn: "desc" } }),
        prisma.mensajeWhatsApp.count({
          where: { cuentaId: c.id, tipo: "RECIBO", estado: "FALLIDO", actualizadoEn: { gte: new Date(Date.now() - 48 * 3600_000) } },
        }),
      ]);
      return { ...c, enviadosHoy, pendientes, fallidosHoy, revisar, campana, recibosFallidos };
    })
  );

  const alertas: Alerta[] = [];
  if (control?.paroGlobal) alertas.push({ nivel: "error", texto: `Paro global activo (${control.paroPor ?? "?"})` });
  if (cuentas.length > 0 && !workerVivo) {
    alertas.push({ nivel: "error", texto: "Worker caído: sin latido en más de 2 minutos" });
  }
  if (workerVivo && huellaApp && huellaWorker !== huellaApp) {
    alertas.push({
      nivel: "error",
      texto:
        `El worker de WhatsApp está desactualizado respecto a la app (cambió código que usa: app ${huellaApp} · worker ${huellaWorker ?? "?"}). ` +
        "Reconstrúyelo en el VPS: sudo docker compose --profile whatsapp build whatsapp && sudo docker compose --profile whatsapp up -d whatsapp",
    });
  }
  if (latido && latido.rssMb > MEMORIA_ALTA_MB * Math.max(1, cuentas.length)) {
    alertas.push({ nivel: "aviso", texto: `Memoria alta del worker: ${latido.rssMb} MB` });
  }
  for (const f of filas) {
    const etq = f.owner.nombre ?? f.owner.email;
    if (f.estado === "BLOQUEADO") alertas.push({ nivel: "error", cuentaId: f.id, texto: `${etq}: número restringido — ${f.ultimoError ?? ""}` });
    if (f.estado === "DESCONECTADO" && f.ultimaConexion && ahora - f.ultimaConexion.getTime() > SESION_CAIDA_MS) {
      alertas.push({ nivel: "error", cuentaId: f.id, texto: `${etq}: sesión caída hace más de 10 min` });
    }
    if (f.enviadosHoy > CUPO_DIARIO) {
      alertas.push({ nivel: "aviso", cuentaId: f.id, texto: `${etq}: ${f.enviadosHoy} mensajes hoy (tope ${CUPO_DIARIO}, por recibos)` });
    }
    const totalHoy = f.enviadosHoy + f.fallidosHoy;
    if (totalHoy >= 10 && f.fallidosHoy / totalHoy > 0.02) {
      alertas.push({ nivel: "aviso", cuentaId: f.id, texto: `${etq}: ${f.fallidosHoy} fallidos hoy (>2 %)` });
    }
    if (f.campana?.estado === "ERROR") {
      alertas.push({ nivel: "error", cuentaId: f.id, texto: `${etq}: campaña de presentación con error — ${f.campana.pausaMotivo ?? ""}` });
    }
    if (f.campana?.estado === "PAUSADA" && f.campana.pausaMotivo?.startsWith("Freno")) {
      alertas.push({ nivel: "aviso", cuentaId: f.id, texto: `${etq}: ${f.campana.pausaMotivo}` });
    }
    if (f.recibosFallidos > 0) {
      alertas.push({
        nivel: "error",
        cuentaId: f.id,
        texto: `${etq}: ${f.recibosFallidos} recibo(s) automáticos fallaron (los cobros sí quedaron registrados) — reintentar o mandar a mano`,
      });
    }
    if (f.revisar > 0) alertas.push({ nivel: "aviso", cuentaId: f.id, texto: `${etq}: ${f.revisar} mensaje(s) por revisar` });
    if (f.ultimoError?.startsWith("Se vinculó")) alertas.push({ nivel: "error", cuentaId: f.id, texto: `${etq}: ${f.ultimoError}` });
  }
  const nocturnos = await prisma.envioWhatsApp.count({
    where: { enviadoEn: { gte: hoy }, tipo: "RECIBO" },
  });
  if (nocturnos > 0) {
    const fuera = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "EnvioWhatsApp"
      WHERE "enviadoEn" >= ${hoy} AND tipo = 'RECIBO'
        AND (EXTRACT(HOUR FROM "enviadoEn" AT TIME ZONE 'America/Mexico_City') < 9
          OR EXTRACT(HOUR FROM "enviadoEn" AT TIME ZONE 'America/Mexico_City') >= 19)`;
    const n = Number(fuera[0]?.n ?? 0);
    if (n > 0) alertas.push({ nivel: "info", texto: `${n} recibo(s) enviados hoy fuera de 9:00–19:00` });
  }

  const sel = cuentaSeleccionada ? filas.find((f) => f.id === cuentaSeleccionada) : undefined;
  return {
    paroGlobal: control?.paroGlobal ?? false,
    workerVivo,
    latidoEn: control?.latidoEn ?? null,
    latido: latido ?? null,
    huellaApp,
    huellaWorker,
    cuentas: filas,
    usuariosSinNumero: usuarios,
    alertas,
    detalle: sel ? await detalleCuenta(sel.id) : null,
  };
}

async function detalleCuenta(cuentaId: string) {
  const hoy = startOfDay(new Date());
  const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cuenta = await prisma.cuentaWhatsApp.findUniqueOrThrow({
    where: { id: cuentaId },
    include: { owner: { select: { nombre: true, email: true } } },
  });
  const [porTipoHoy, porEstado, mensajes, revertidos, optOuts, campana, procesos, bitacora, reconexiones, proximo, acks] =
    await Promise.all([
      prisma.envioWhatsApp.groupBy({ by: ["tipo"], where: { cuentaId, enviadoEn: { gte: hoy } }, _count: true }),
      prisma.mensajeWhatsApp.groupBy({ by: ["estado"], where: { cuentaId }, _count: true }),
      prisma.mensajeWhatsApp.findMany({
        where: { cuentaId },
        orderBy: { actualizadoEn: "desc" },
        take: 300,
        include: { envio: { select: { ack: true, enviadoEn: true, texto: true, conPresentacion: true } } },
      }),
      prisma.mensajeWhatsApp.findMany({ where: { cuentaId, revertido: true }, orderBy: { actualizadoEn: "desc" } }),
      prisma.optOutWhatsApp.findMany({ where: { cuentaId }, orderBy: { fecha: "desc" } }),
      prisma.campanaWhatsApp.findFirst({ where: { cuentaId }, orderBy: { iniciadaEn: "desc" } }),
      prisma.procesoWhatsApp.findMany({
        where: { OR: [{ cuentaId }, { cuentaId: null }] },
        orderBy: { inicio: "desc" },
        take: 40,
      }),
      prisma.bitacoraWhatsApp.findMany({
        where: { OR: [{ cuentaId }, { cuentaId: null }] },
        orderBy: { creadoEn: "desc" },
        take: 200,
      }),
      prisma.bitacoraWhatsApp.groupBy({
        by: ["tipo"],
        where: { cuentaId, tipo: "conectado", creadoEn: { gte: hace7 } },
        _count: true,
      }),
      prisma.mensajeWhatsApp.findFirst({
        where: { cuentaId, estado: "PENDIENTE" },
        orderBy: [{ prioridad: "asc" }, { programadoPara: "asc" }],
        select: { programadoPara: true, tipo: true },
      }),
      prisma.envioWhatsApp.groupBy({ by: ["ack"], where: { cuentaId, enviadoEn: { gte: hoy } }, _count: true }),
    ]);

  const reconexionesHoy = await prisma.bitacoraWhatsApp.count({ where: { cuentaId, tipo: "conectado", creadoEn: { gte: hoy } } });

  let campanaInfo = null;
  if (campana) {
    const [enviados, faltan, bajas] = await Promise.all([
      prisma.mensajeWhatsApp.count({ where: { campanaId: campana.id, estado: "ENVIADO" } }),
      prisma.mensajeWhatsApp.count({ where: { campanaId: campana.id, estado: "PENDIENTE" } }),
      prisma.optOutWhatsApp.count({ where: { cuentaId, fecha: { gte: campana.iniciadaEn } } }),
    ]);
    const bajasHoy = await prisma.optOutWhatsApp.count({ where: { cuentaId, activo: true, fecha: { gte: hoy } } });
    campanaInfo = { ...campana, enviados, faltan, bajas, bajasHoy };
  }

  const qrImagen = cuenta.qr ? await QRCode.toDataURL(cuenta.qr, { margin: 1, width: 280 }) : null;

  return {
    cuenta: { ...cuenta, qr: undefined },
    qrImagen,
    porTipoHoy: porTipoHoy.map((x) => ({ tipo: x.tipo, n: x._count })),
    porEstado: porEstado.map((x) => ({ estado: x.estado, n: x._count })),
    acksHoy: acks.map((x) => ({ ack: x.ack, n: x._count })),
    mensajes,
    revertidos,
    optOuts,
    campana: campanaInfo,
    procesos,
    bitacora,
    reconexiones7d: reconexiones[0]?._count ?? 0,
    reconexionesHoy,
    proximo,
  };
}
