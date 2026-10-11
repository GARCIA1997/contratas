import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { MensajeWhatsApp, TipoMensajeWhatsApp } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { anclarFechaCliente } from "@/lib/fechas";
import { mensajeRecordatorio, mensajeRecordatorioAbono, type CuotaPendiente } from "@/lib/mensajes-whatsapp";
import { saldoActual } from "@/lib/services/deudores";
import { registrarBitacora } from "@/lib/whatsapp-auto/bitacora";
import {
  CUPO_DIARIO,
  RECIBO_VIGENCIA_MS,
  VENTANA_AGRUPACION_RECIBOS_MS,
  cupoPresentacion,
  enHorario,
  espaciadoMs,
  esTransaccional,
} from "@/lib/whatsapp-auto/reglas";
import { lineaPresentacion, textoPresentacion } from "@/lib/whatsapp-auto/textos";
import { normalizarTelefono } from "@/lib/whatsapp-auto/telefono";
import { diasConEnvioDeCampana, presentacionesHoy } from "./campana";
import { marcarRestringida, SinWhatsApp, type Sesion } from "./sesion";

/**
 * Despachador (P3). Por cada cuenta conectada y sin pausa, en cada vuelta
 * manda a lo más UN mensaje de WhatsApp (que puede juntar varios avisos del
 * mismo destinatario), respetando:
 *  - prioridad: recibos → recordatorios de cuota → deudores → presentación;
 *  - cupo de 100 diarios (los recibos y confirmaciones nunca se bloquean);
 *  - horario 9–19 para todo menos recibos y confirmaciones;
 *  - espaciado aleatorio entre mensajes;
 *  - "a lo más una vez": se marca ENVIANDO antes de mandar.
 * Lo que se arma al enviar se revalida contra la BD en ese momento (monto
 * vigente, cuota ya pagada, teléfono cambiado, opt-out).
 */

type Cuenta = NonNullable<Awaited<ReturnType<typeof cargarCuenta>>>;

/**
 * Tiempos por número. Los recibos llevan su propio espaciado y NO esperan
 * detrás de un recordatorio (30 s–3 min): el cobrador está viendo en su
 * pantalla si el recibo salió. Entre dos mensajes cualesquiera siempre hay
 * al menos MIN_ENTRE_MENSAJES_MS.
 */
const proximoEnvio = new Map<string, number>();
const proximoRecibo = new Map<string, number>();
const proximaPresentacion = new Map<string, number>();
const MIN_ENTRE_MENSAJES_MS = 10_000;

function cargarCuenta(cuentaId: string) {
  return prisma.cuentaWhatsApp.findUnique({
    where: { id: cuentaId },
    include: { owner: { select: { configuracion: { select: { nombreApp: true } } } } },
  });
}

export async function despacharCuenta(sesion: Sesion, paroGlobal: boolean): Promise<void> {
  if (paroGlobal || !sesion.conectada) return;
  const ahora = Date.now();
  if ((proximoEnvio.get(sesion.cuentaId) ?? 0) > ahora && (proximoRecibo.get(sesion.cuentaId) ?? 0) > ahora) return;
  const cuenta = await cargarCuenta(sesion.cuentaId);
  if (!cuenta || cuenta.estado !== "CONECTADO" || cuenta.pausadaPorAdmin || cuenta.pausadaPorUsuario) return;

  // Varias vueltas por si lo primero que se toma resulta cancelado al revalidar.
  for (let i = 0; i < 10; i++) {
    const r = await intentarUno(sesion, cuenta);
    if (r !== "nada_enviado_reintentar") return;
  }
}

async function intentarUno(
  sesion: Sesion,
  cuenta: Cuenta
): Promise<"enviado" | "sin_candidatos" | "nada_enviado_reintentar" | "error"> {
  const ahora = new Date();
  const hoy = startOfDay(ahora);
  const enviadosHoy = await prisma.envioWhatsApp.count({ where: { cuentaId: cuenta.id, enviadoEn: { gte: hoy } } });
  const hayCupo = enviadosHoy < CUPO_DIARIO;
  const horario = enHorario(ahora);

  const campana = await prisma.campanaWhatsApp.findFirst({ where: { cuentaId: cuenta.id, estado: "ACTIVA" } });
  let presentacionPermitida = false;
  if (campana && hayCupo && horario && (proximaPresentacion.get(cuenta.id) ?? 0) <= Date.now()) {
    const tope = cupoPresentacion(await diasConEnvioDeCampana(campana.id));
    presentacionPermitida = (await presentacionesHoy(campana.id, hoy)) < tope;
  }

  const candidatos = await prisma.mensajeWhatsApp.findMany({
    where: { cuentaId: cuenta.id, estado: "PENDIENTE", programadoPara: { lte: ahora } },
    orderBy: [{ prioridad: "asc" }, { orden: "asc" }, { creadoEn: "asc" }],
    take: 200,
  });

  const ahoraMs = Date.now();
  const reciboLibre = (proximoRecibo.get(cuenta.id) ?? 0) <= ahoraMs;
  const generalLibre = (proximoEnvio.get(cuenta.id) ?? 0) <= ahoraMs;
  const elegible = (m: MensajeWhatsApp) => {
    if (esTransaccional(m.tipo) && !reciboLibre) return false;
    if (!esTransaccional(m.tipo) && !generalLibre) return false;
    if (m.tipo === "RECIBO")
      return cuenta.activo && m.creadoEn.getTime() <= ahora.getTime() - VENTANA_AGRUPACION_RECIBOS_MS;
    if (esTransaccional(m.tipo)) return true;
    if (!hayCupo || !horario) return false;
    if (m.tipo === "POR_VENCER") return cuenta.activo && cuenta.porVencer;
    if (m.tipo === "VENCIDA") return cuenta.activo && cuenta.vencidas;
    if (m.tipo === "DEUDOR") return cuenta.activo && cuenta.deudores;
    if (m.tipo === "PRESENTACION") return presentacionPermitida && m.campanaId === campana?.id;
    return false;
  };

  const primero = candidatos.find(elegible);
  if (!primero) {
    if (campana && !candidatos.some((m) => m.campanaId === campana.id)) {
      const restantes = await prisma.mensajeWhatsApp.count({ where: { campanaId: campana.id, estado: "PENDIENTE" } });
      if (restantes === 0) {
        await prisma.campanaWhatsApp.update({
          where: { id: campana.id },
          data: { estado: "TERMINADA", terminadaEn: new Date() },
        });
        await registrarBitacora({ cuentaId: cuenta.id, tipo: "campana_terminada", detalle: { campanaId: campana.id } });
      }
    }
    return "sin_candidatos";
  }

  // Se juntan los avisos del mismo destinatario que pueden ir en un mensaje.
  const familia = familiaDe(primero.tipo);
  const grupo = candidatos.filter(
    (m) => m.telefono === primero.telefono && familiaDe(m.tipo) === familia && elegible(m) && (familia !== "unico" || m.id === primero.id)
  );
  const ids = grupo.map((m) => m.id);
  const tomados = await prisma.mensajeWhatsApp.updateMany({
    where: { id: { in: ids }, estado: "PENDIENTE" },
    data: { estado: "ENVIANDO" },
  });
  if (tomados.count === 0) return "nada_enviado_reintentar";
  const enviando = await prisma.mensajeWhatsApp.findMany({
    where: { id: { in: ids }, estado: "ENVIANDO" },
    orderBy: { creadoEn: "asc" },
  });

  const nombreApp = cuenta.owner.configuracion?.nombreApp ?? "Kredired";
  const armado = await armarTexto(cuenta, enviando, nombreApp, ahora);
  if (armado.cancelados.length > 0) {
    await prisma.$transaction(
      armado.cancelados.map((c) =>
        prisma.mensajeWhatsApp.update({ where: { id: c.id }, data: { estado: "CANCELADO", motivo: c.motivo } })
      )
    );
  }
  if (!armado.texto || armado.validos.length === 0) {
    // Nada que mandar: lo tomado no puede quedarse en ENVIANDO.
    if (armado.validos.length > 0) {
      await prisma.mensajeWhatsApp.updateMany({
        where: { id: { in: armado.validos.map((m) => m.id) } },
        data: { estado: "CANCELADO", motivo: "Sin texto para enviar: mandarlo a mano" },
      });
    }
    return "nada_enviado_reintentar";
  }

  // Primer mensaje a alguien que aún no conoce el número: lleva la presentación.
  const telefono = primero.telefono;
  const yaPresentado = await prisma.presentacionWhatsApp.findUnique({
    where: { cuentaId_telefono: { cuentaId: cuenta.id, telefono } },
  });
  const esPresentacion = primero.tipo === "PRESENTACION";
  const conPresentacion = !yaPresentado && !esPresentacion && primero.tipo !== "CONFIRMACION_BAJA";
  const texto = conPresentacion ? `${lineaPresentacion(nombreApp)}\n\n${armado.texto}` : armado.texto;

  let waMensajeId: string | null;
  try {
    waMensajeId = await sesion.enviar(telefono, texto);
  } catch (e) {
    await alFallar(cuenta.id, armado.validos.map((m) => m.id), e);
    return "error";
  }

  const validosIds = armado.validos.map((m) => m.id);
  await prisma.$transaction(async (tx) => {
    const envio = await tx.envioWhatsApp.create({
      data: {
        cuentaId: cuenta.id,
        numeroOrigen: cuenta.numero,
        telefono,
        tipo: primero.tipo,
        texto,
        conPresentacion,
        waMensajeId,
      },
    });
    await tx.mensajeWhatsApp.updateMany({
      where: { id: { in: validosIds } },
      data: { estado: "ENVIADO", envioId: envio.id, texto: armado.validos.length === 1 ? texto : undefined },
    });
    if (esPresentacion || conPresentacion) {
      await tx.presentacionWhatsApp.upsert({
        where: { cuentaId_telefono: { cuentaId: cuenta.id, telefono } },
        create: { cuentaId: cuenta.id, telefono, via: esPresentacion ? "campana" : "primer_mensaje" },
        update: {},
      });
      // Ya se presentó en este mensaje: su turno en la campaña sobra.
      await tx.mensajeWhatsApp.updateMany({
        where: { cuentaId: cuenta.id, telefono, tipo: "PRESENTACION", estado: "PENDIENTE" },
        data: { estado: "CANCELADO", motivo: "Ya se presentó en otro mensaje" },
      });
    }
  });

  const t = Date.now();
  const masTarde = (m: Map<string, number>, hasta: number) => m.set(cuenta.id, Math.max(m.get(cuenta.id) ?? 0, hasta));
  if (esTransaccional(primero.tipo)) {
    proximoRecibo.set(cuenta.id, t + espaciadoMs("RECIBO"));
    masTarde(proximoEnvio, t + MIN_ENTRE_MENSAJES_MS);
  } else {
    proximoEnvio.set(cuenta.id, t + espaciadoMs("POR_VENCER"));
    masTarde(proximoRecibo, t + MIN_ENTRE_MENSAJES_MS);
  }
  if (esPresentacion) proximaPresentacion.set(cuenta.id, Date.now() + espaciadoMs("PRESENTACION"));
  return "enviado";
}

function familiaDe(tipo: TipoMensajeWhatsApp): "recibo" | "cuota" | "unico" {
  if (tipo === "RECIBO") return "recibo";
  if (tipo === "POR_VENCER" || tipo === "VENCIDA") return "cuota";
  return "unico";
}

type Armado = {
  texto: string | null;
  validos: MensajeWhatsApp[];
  cancelados: { id: string; motivo: string }[];
};

const RECORDATORIO_VIGENCIA_MS = 48 * 60 * 60 * 1000;

async function armarTexto(cuenta: Cuenta, mensajes: MensajeWhatsApp[], nombreApp: string, ahora: Date): Promise<Armado> {
  const cancelados: Armado["cancelados"] = [];
  const validos: MensajeWhatsApp[] = [];
  const telefono = mensajes[0].telefono;

  const optOut = await prisma.optOutWhatsApp.findUnique({
    where: { cuentaId_telefono: { cuentaId: cuenta.id, telefono } },
  });
  const tipo0 = mensajes[0].tipo;
  if (optOut?.activo && tipo0 !== "CONFIRMACION_BAJA") {
    return { texto: null, validos, cancelados: mensajes.map((m) => ({ id: m.id, motivo: "Opt-out" })) };
  }

  if (tipo0 === "CONFIRMACION_BAJA") {
    return { texto: mensajes[0].texto, validos: [mensajes[0]], cancelados };
  }

  if (tipo0 === "RECIBO") {
    for (const m of mensajes) {
      const motivo = await motivoCancelarRecibo(cuenta.ownerId, m, ahora);
      if (motivo) cancelados.push({ id: m.id, motivo });
      else validos.push(m);
    }
    return { texto: validos.map((m) => m.texto).filter(Boolean).join("\n\n") || null, validos, cancelados };
  }

  // Un recordatorio que esperó días (número desconectado o pausado) ya no
  // sirve: se descarta en vez de mandar avisos atrasados en ráfaga.
  if (["POR_VENCER", "VENCIDA", "DEUDOR"].includes(tipo0)) {
    const viejos = mensajes.filter((m) => ahora.getTime() - m.creadoEn.getTime() > RECORDATORIO_VIGENCIA_MS);
    if (viejos.length > 0) {
      cancelados.push(...viejos.map((m) => ({ id: m.id, motivo: "Recordatorio con más de 48 h sin enviarse" })));
      mensajes = mensajes.filter((m) => !viejos.includes(m));
      if (mensajes.length === 0) return { texto: null, validos, cancelados };
    }
  }

  if (tipo0 === "POR_VENCER" || tipo0 === "VENCIDA") {
    const cuotas: CuotaPendiente[] = [];
    let nombre = mensajes[0].destinatarioNombre;
    for (const m of mensajes) {
      const pago = await prisma.pago.findFirst({
        where: { contrataId: m.contrataId ?? "", numeroCuota: m.numeroCuota ?? -1, contrata: { ownerId: cuenta.ownerId } },
        include: { contrata: { include: { cliente: true, pagos: { select: { id: true } } } } },
      });
      const pendiente = pago ? Math.round((pago.contrata.abono - pago.montoAbonado) * 100) / 100 : 0;
      const motivo = !pago
        ? "La contrata ya no existe"
        : pago.pagado || pendiente <= 0
          ? "La cuota ya está pagada"
          : pago.contrata.convertidaADeuda
            ? "La contrata pasó a deuda"
            : normalizarTelefono(pago.contrata.cliente.telefono) !== telefono
              ? "El cliente cambió de teléfono"
              : null;
      if (motivo || !pago) {
        cancelados.push({ id: m.id, motivo: motivo ?? "No encontrada" });
        continue;
      }
      nombre = pago.contrata.cliente.nombre;
      validos.push(m);
      cuotas.push({
        numeroCuota: pago.numeroCuota,
        numCuotas: pago.contrata.pagos.length,
        pendiente,
        diasAtraso: differenceInCalendarDays(startOfDay(ahora), anclarFechaCliente(pago.fechaProgramada)),
      });
    }
    if (cuotas.length === 0) return { texto: null, validos, cancelados };
    cuotas.sort((a, b) => b.diasAtraso - a.diasAtraso);
    const texto = mensajeRecordatorio({
      nombreApp,
      clienteNombre: nombre,
      total: Math.round(cuotas.reduce((s, c) => s + c.pendiente, 0) * 100) / 100,
      diasAtrasoMax: cuotas[0].diasAtraso,
      cuotas,
    });
    return { texto, validos, cancelados };
  }

  const m = mensajes[0];
  if (tipo0 === "DEUDOR") {
    const deudor = await prisma.deudor.findFirst({
      where: { id: m.deudorId ?? "", ownerId: cuenta.ownerId },
      include: { abonos: { orderBy: { fecha: "asc" } } },
    });
    const saldo = deudor ? saldoActual(deudor) : 0;
    const motivo = !deudor
      ? "El deudor ya no existe"
      : saldo <= 0
        ? "La deuda ya está liquidada"
        : normalizarTelefono(deudor.telefono) !== telefono
          ? "El deudor cambió de teléfono"
          : null;
    if (motivo || !deudor) return { texto: null, validos, cancelados: [{ id: m.id, motivo: motivo ?? "No encontrado" }] };
    const ultimo = deudor.abonos[deudor.abonos.length - 1];
    const texto = mensajeRecordatorioAbono({
      nombreApp,
      nombre: deudor.nombre,
      deudaInicial: deudor.deudaInicial,
      saldoActual: saldo,
      ultimoAbono: ultimo ? { fecha: ultimo.fecha, monto: ultimo.monto } : null,
      hoy: ahora,
    });
    return { texto, validos: [m], cancelados };
  }

  if (tipo0 === "PRESENTACION") {
    const ya = await prisma.presentacionWhatsApp.findUnique({
      where: { cuentaId_telefono: { cuentaId: cuenta.id, telefono } },
    });
    if (ya) return { texto: null, validos, cancelados: [{ id: m.id, motivo: "Ya se presentó" }] };
    return { texto: textoPresentacion(m.destinatarioNombre, nombreApp, m.orden ?? 0), validos: [m], cancelados };
  }

  return { texto: null, validos, cancelados: [{ id: m.id, motivo: `Tipo desconocido ${tipo0}` }] };
}

/** El recibo ya no corresponde: el cobro se revirtió, cambió el teléfono o esperó demasiado. */
async function motivoCancelarRecibo(ownerId: string, m: MensajeWhatsApp, ahora: Date): Promise<string | null> {
  if (!m.texto) return "El recibo no se pudo preparar: mandarlo a mano";
  if (ahora.getTime() - m.creadoEn.getTime() > RECIBO_VIGENCIA_MS) {
    return "Recibo con más de 24 h sin enviarse: mandarlo a mano";
  }
  if (m.pagoIds.length > 0) {
    const pagos = await prisma.pago.findMany({
      where: { id: { in: m.pagoIds }, contrata: { ownerId } },
      select: { pagado: true, montoAbonado: true },
    });
    if (pagos.length !== m.pagoIds.length || pagos.some((p) => !p.pagado && p.montoAbonado <= 0)) {
      return "El cobro se revirtió antes de enviarse";
    }
  }
  if (m.abonoDeudorId) {
    const abono = await prisma.abonoDeudor.findFirst({ where: { id: m.abonoDeudorId, deudor: { ownerId } } });
    if (!abono) return "El abono ya no existe";
  }
  const actual = m.clienteId
    ? (await prisma.cliente.findFirst({ where: { id: m.clienteId, ownerId }, select: { telefono: true } }))?.telefono
    : m.deudorId
      ? (await prisma.deudor.findFirst({ where: { id: m.deudorId, ownerId }, select: { telefono: true } }))?.telefono
      : null;
  if (normalizarTelefono(actual) !== m.telefono) return "El destinatario cambió de teléfono o ya no existe";
  return null;
}

async function alFallar(cuentaId: string, ids: string[], e: unknown) {
  const mensaje = e instanceof Error ? e.message : String(e);
  if (e instanceof SinWhatsApp) {
    await prisma.mensajeWhatsApp.updateMany({ where: { id: { in: ids } }, data: { estado: "FALLIDO", motivo: mensaje } });
    return;
  }
  const codigo = (e as { output?: { statusCode?: number } })?.output?.statusCode;
  if (codigo === 403 || codigo === 401) {
    await prisma.mensajeWhatsApp.updateMany({ where: { id: { in: ids } }, data: { estado: "FALLIDO", motivo: mensaje } });
    await marcarRestringida(cuentaId, `Error ${codigo} al enviar: ${mensaje}`);
    return;
  }
  // El socket estaba cerrado: no salió nada, se puede volver a intentar.
  if (/connection closed|not connected/i.test(mensaje)) {
    await prisma.mensajeWhatsApp.updateMany({ where: { id: { in: ids } }, data: { estado: "PENDIENTE" } });
    return;
  }
  await prisma.mensajeWhatsApp.updateMany({ where: { id: { in: ids } }, data: { estado: "FALLIDO", motivo: mensaje } });
  await registrarBitacora({ cuentaId, tipo: "error_envio", detalle: { mensaje, ids } });
}
