import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TipoContrata } from "@prisma/client";
import { formatMoneda } from "@/lib/utils";

/**
 * Todos los mensajes de WhatsApp que la app le manda al cliente, en un solo
 * lugar.
 *
 * Antes vivían repartidos en seis componentes, cada uno con su propio
 * formato: unos abrían con el nombre del negocio y otros lo firmaban al
 * final, los emojis cambiaban de un mensaje a otro, y el mismo dato ("cuota
 * 7 de 10") se escribía de tres maneras. Para el cliente que recibe varios
 * a lo largo de una contrata, eso no se lee como una empresa — se lee como
 * mensajes sueltos de alguien distinto cada vez.
 *
 * Reglas que sigue todo mensaje de aquí:
 *
 *  1. La marca abre y cierra SIEMPRE. Es lo único que el cliente ve de la
 *     empresa, así que es donde se construye el reconocimiento.
 *  2. Un emoji por línea, como columna: en la pantalla angosta de WhatsApp
 *     hace que el mensaje se recorra como una tabla y no como un párrafo.
 *  3. El recibo confirma, no regaña. El atraso solo aparece en el
 *     recordatorio, que es donde el cliente puede hacer algo al respecto.
 *  4. Las listas largas se resumen: las primeras, el hueco explícito, y la
 *     última. Un plan de 52 semanas no se manda completo.
 *
 * Son funciones puras (texto entra, texto sale) a propósito: así se pueden
 * probar sin navegador — ver mensajes-whatsapp.test.ts.
 */

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

const LINEA = "━━━━━━━━━━━━━━━";

/** La marca va en MAYÚSCULAS: es el único elemento que se repite en todos
 *  los mensajes, y así destaca sobre el resto del texto. */
function marca(nombreApp: string) {
  return nombreApp.toUpperCase();
}

function fechaLarga(d: Date) {
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: es });
}

function fechaCorta(d: Date) {
  return format(d, "d MMM yyyy", { locale: es });
}

/**
 * El armazón común: encabezado con la marca, el título del documento, el
 * cuerpo, y la firma. Ningún mensaje se construye sin pasar por aquí.
 */
function envolver(opts: {
  nombreApp: string;
  icono: string;
  titulo: string;
  cuerpo: string[];
  cierre?: string[];
}) {
  const m = marca(opts.nombreApp);
  return [
    `🧾 *${m}*`,
    LINEA,
    `${opts.icono} *${opts.titulo.toUpperCase()}*`,
    ``,
    ...opts.cuerpo,
    LINEA,
    ...(opts.cierre ?? []),
    `_Enviado por_ *${m}*`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** "Te atendió: X" — solo si se sabe quién. */
function atendio(hechoPor?: string | null) {
  return hechoPor ? [`🧑‍💼 Te atendió: ${hechoPor}`] : [];
}

/* ── Recibo de pago ─────────────────────────────────────────────────────── */

export type CobroContrata = {
  /**
   * Opcional porque Ruta cobra cuotas sueltas y no arrastra el tipo de cada
   * contrata. Sin él simplemente no se pone encabezado de grupo — mejor eso
   * que un rótulo inventado en un documento que ve el cliente.
   */
  tipo?: TipoContrata;
  numCuotas: number;
  /** Capital prestado — el "de cuánto es la contrata". */
  montoContrata?: number;
  /** Lo que queda por pagar tras este cobro. */
  saldoTrasCobro?: number;
  cuotas: {
    numeroCuota: number;
    monto: number;
    /**
     * El pago NO alcanzó a cubrir la cuota. Sin esto, un abono parcial se
     * imprimía con el mismo ✅ que un pago completo y el cliente entendía
     * que su cuota ya estaba cubierta — el problema que este campo arregla.
     */
    parcial?: boolean;
    /** Lo que le sigue faltando a esa cuota. Solo tiene sentido con `parcial`. */
    faltante?: number;
  }[];
  subtotal: number;
};

export function mensajeCobro(opts: {
  nombreApp: string;
  clienteNombre: string;
  total: number;
  contratas: CobroContrata[];
  fecha?: Date;
  hechoPor?: string | null;
}): string {
  const fecha = opts.fecha ?? new Date();
  const detalle: string[] = [];

  for (const c of opts.contratas) {
    const contexto =
      c.montoContrata !== undefined ? `préstamo de ${formatMoneda(c.montoContrata)}` : "";
    const conEncabezado = Boolean(c.tipo) || Boolean(contexto);
    if (c.tipo) {
      detalle.push(`🔹 *${TIPO_LABEL[c.tipo]}*${contexto ? ` · ${contexto}` : ""}`);
    } else if (contexto) {
      detalle.push(`🔹 ${contexto}`);
    }
    // La sangría solo tiene sentido colgando de un encabezado de grupo. Sin
    // él (Ruta, que no arrastra el tipo de contrata) las cuotas quedaban
    // indentadas bajo nada, como si faltara una línea.
    const sangria = conEncabezado ? "     " : "";
    for (const q of c.cuotas) {
      // 🟡 y la palabra "abono" para lo parcial; ✅ solo cuando la cuota
      // de verdad quedó cubierta. Mismo código visual que las "cuotas
      // incompletas" del estado de cuenta y del detalle de contrata, para
      // que el cliente lo lea igual en los tres documentos.
      if (q.parcial) {
        detalle.push(
          `${sangria}🟡 Cuota ${q.numeroCuota} de ${c.numCuotas} — abono de ${formatMoneda(q.monto)}` +
            (q.faltante !== undefined
              ? `, le falta *${formatMoneda(q.faltante)}*`
              : ` _(cuota incompleta)_`)
        );
      } else {
        detalle.push(
          `${sangria}✅ Cuota ${q.numeroCuota} de ${c.numCuotas} — ${formatMoneda(q.monto)}`
        );
      }
    }
    if (c.saldoTrasCobro !== undefined) {
      detalle.push(
        c.saldoTrasCobro > 0
          ? `${sangria}💠 Te resta por pagar: *${formatMoneda(c.saldoTrasCobro)}*`
          : `${sangria}🎉 *¡Contrata liquidada!*`
      );
    }
    detalle.push(``);
  }

  // Si alguna cuota quedó a medias, se dice con todas sus letras. El
  // renglón 🟡 ya lo indica, pero este documento es el comprobante del
  // cliente: vale más una línea de más que un reclamo después por creer
  // que una cuota estaba saldada.
  const hayParciales = opts.contratas.some((c) => c.cuotas.some((q) => q.parcial));
  const nota = hayParciales
    ? [
        `🟡 _Las cuotas marcadas en amarillo recibieron un abono parcial:_`,
        `_se registró tu pago, pero esa cuota todavía no queda cubierta._`,
        ``,
      ]
    : [];

  return envolver({
    nombreApp: opts.nombreApp,
    // El ✅ del encabezado también comunica "quedó saldado". En un recibo
    // donde alguna cuota quedó a medias se cambia por el mismo 🟡 de los
    // renglones parciales: era justo la señal que hacía leer el documento
    // como un pago completo.
    icono: hayParciales ? "🟡" : "✅",
    titulo: hayParciales ? "Recibo de abono" : "Recibo de pago",
    cuerpo: [
      `👤 *${opts.clienteNombre}*`,
      `📅 ${fechaLarga(fecha)}`,
      ...atendio(opts.hechoPor),
      ``,
      `💵 *TOTAL ${hayParciales ? "RECIBIDO" : "COBRADO"}: ${formatMoneda(opts.total)}*`,
      ``,
      LINEA,
      `📋 *DETALLE*`,
      ``,
      ...detalle,
      ...nota,
    ],
    cierre: [`🙏 *¡Gracias por tu pago!*`, `💾 Conserva este mensaje como comprobante.`, ``],
  });
}

/* ── Comprobante de entrega ─────────────────────────────────────────────── */

/** Fechas que se listan al inicio antes de resumir (ver regla 4 arriba). */
const FECHAS_AL_INICIO = 3;

export function mensajeEntrega(opts: {
  nombreApp: string;
  clienteNombre: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  pagos: { numeroCuota: number; fecha: Date }[];
  fecha?: Date;
  hechoPor?: string | null;
}): string {
  const fecha = opts.fecha ?? new Date();
  const total = Math.round(opts.abono * opts.numCuotas * 100) / 100;
  const ordenados = [...opts.pagos].sort((a, b) => a.numeroCuota - b.numeroCuota);

  // Con 4 o menos caben todas: resumir escondería una sola fecha, que
  // confunde más de lo que ayuda.
  const resumir = ordenados.length > FECHAS_AL_INICIO + 1;
  const primeras = resumir ? ordenados.slice(0, FECHAS_AL_INICIO) : ordenados;
  const ocultas = resumir ? ordenados.slice(FECHAS_AL_INICIO, -1) : [];
  const ultima = resumir ? ordenados[ordenados.length - 1] : null;

  const calendario = primeras.map(
    (p, i) =>
      `📌 Pago ${p.numeroCuota} de ${opts.numCuotas} → *${fechaCorta(p.fecha)}*` +
      (i === 0 ? `  _(tu primer pago)_` : "")
  );

  if (ocultas.length > 0) {
    calendario.push(
      `        ⋯ *${ocultas.length} pago${ocultas.length === 1 ? "" : "s"} más*` +
        (ocultas.length === 1
          ? ` el ${fechaCorta(ocultas[0].fecha)}`
          : ` entre el ${fechaCorta(ocultas[0].fecha)} y el ${fechaCorta(ocultas[ocultas.length - 1].fecha)}`)
    );
  }
  if (ultima) {
    calendario.push(
      `🏁 Pago ${ultima.numeroCuota} de ${opts.numCuotas} → *${fechaCorta(ultima.fecha)}*  _(último — aquí queda liquidada)_`
    );
  }

  return envolver({
    nombreApp: opts.nombreApp,
    icono: "📦",
    titulo: "Comprobante de entrega",
    cuerpo: [
      `👤 *${opts.clienteNombre}*`,
      `📅 Entregado el ${fechaLarga(fecha)}`,
      ...atendio(opts.hechoPor),
      ``,
      `💵 *MONTO ENTREGADO: ${formatMoneda(opts.monto)}*`,
      ``,
      LINEA,
      `📊 *TU PLAN DE PAGOS*`,
      ``,
      `📋 Tipo: *${TIPO_LABEL[opts.tipo]}*`,
      `🔢 Número de pagos: *${opts.numCuotas}*`,
      `💰 Cada pago: *${formatMoneda(opts.abono)}*`,
      `🧮 Total a pagar: *${formatMoneda(total)}*`,
      ``,
      `📅 *CALENDARIO*`,
      ``,
      ...calendario,
      ``,
    ],
    cierre: [`🙏 *¡Gracias por tu confianza!*`, `💾 Guarda este mensaje para consultar tus fechas.`, ``],
  });
}

/* ── Recordatorio ───────────────────────────────────────────────────────── */

export type CuotaPendiente = {
  numeroCuota: number;
  numCuotas: number;
  pendiente: number;
  /** Positivo = vencida hace N días · 0 = hoy · negativo = vence en N días. */
  diasAtraso: number;
};

function frasePlazo(dias: number) {
  if (dias > 0) return `${dias} día${dias === 1 ? "" : "s"} de atraso`;
  if (dias === 0) return `vence hoy`;
  return `vence en ${-dias} día${-dias === 1 ? "" : "s"}`;
}

export function mensajeRecordatorio(opts: {
  nombreApp: string;
  clienteNombre: string;
  total: number;
  diasAtrasoMax: number;
  cuotas?: CuotaPendiente[];
}): string {
  const d = opts.diasAtrasoMax;
  const encabezado =
    d > 0
      ? `⚠️ Tienes un pago vencido hace *${d} día${d === 1 ? "" : "s"}*`
      : d === 0
        ? `📆 Hoy vence tu pago`
        : `🔔 Tu próximo pago vence en *${-d} día${-d === 1 ? "" : "s"}*`;

  const detalle =
    opts.cuotas && opts.cuotas.length > 0
      ? [
          `📋 *DETALLE*`,
          ``,
          ...opts.cuotas.map(
            (q) =>
              `🔸 Cuota ${q.numeroCuota} de ${q.numCuotas} — ${formatMoneda(q.pendiente)}  _(${frasePlazo(q.diasAtraso)})_`
          ),
          ``,
        ]
      : [];

  return envolver({
    nombreApp: opts.nombreApp,
    icono: "🔔",
    titulo: "Recordatorio de pago",
    cuerpo: [
      `👋 Hola *${opts.clienteNombre}*`,
      ``,
      encabezado,
      `💵 *TOTAL A PAGAR: ${formatMoneda(opts.total)}*`,
      ``,
      ...(detalle.length > 0 ? [LINEA, ...detalle] : []),
    ],
    cierre: [
      `💬 Si ya realizaste este pago, ignora este mensaje.`,
      `🙏 ¡Gracias por tu preferencia!`,
      ``,
    ],
  });
}

/* ── Estado de cuenta del cliente ───────────────────────────────────────── */

export type ContrataEstado = {
  tipo: TipoContrata;
  montoContrata: number;
  cuotasPagadas: number;
  numCuotas: number;
  saldo: number;
  atrasada: boolean;
  /**
   * Qué números de cuota exactos están atrasados o con abono parcial —
   * no solo que la contrata "está atrasada" en general. Un cliente con 3
   * cuotas sueltas atrasadas de hace meses necesita saber CUÁLES para
   * poder ponerse al corriente; "atrasada" a secas lo obliga a llamar
   * para preguntar, que es justo lo que este mensaje debería evitarle.
   */
  atrasadas?: { numeroCuota: number }[];
  incompletas?: { numeroCuota: number; montoAbonado: number; faltante: number }[];
};

export function mensajeEstadoCuenta(opts: {
  nombreApp: string;
  clienteNombre: string;
  capitalPrestado: number;
  totalAbonado: number;
  saldoPendiente: number;
  contratas: ContrataEstado[];
  fecha?: Date;
}): string {
  const fecha = opts.fecha ?? new Date();
  // Se deriva en vez de recibirse: así siempre cierra con las otras dos.
  const totalAPagar = Math.round((opts.totalAbonado + opts.saldoPendiente) * 100) / 100;

  const detalle =
    opts.contratas.length === 0
      ? [`✨ No tienes contratas activas en este momento.`, ``]
      : opts.contratas.flatMap((c) => [
          `🔹 *${TIPO_LABEL[c.tipo]}* · préstamo de ${formatMoneda(c.montoContrata)}` +
            (c.atrasada ? `  ⚠️ _atrasada_` : ""),
          `     ✅ ${c.cuotasPagadas} de ${c.numCuotas} cuotas pagadas`,
          `     💠 Te resta por pagar: *${formatMoneda(c.saldo)}*`,
          ...(c.atrasadas && c.atrasadas.length > 0
            ? [
                `     ⚠️ Cuotas atrasadas: ${c.atrasadas.map((a) => a.numeroCuota).join(", ")}`,
              ]
            : []),
          ...(c.incompletas && c.incompletas.length > 0
            ? c.incompletas.map(
                (i) =>
                  `     🔸 Cuota ${i.numeroCuota} incompleta — abonado ${formatMoneda(i.montoAbonado)}, falta ${formatMoneda(i.faltante)}`
              )
            : []),
          ``,
        ]);

  return envolver({
    nombreApp: opts.nombreApp,
    icono: "📊",
    titulo: "Estado de cuenta",
    cuerpo: [
      `👤 *${opts.clienteNombre}*`,
      `📅 Corte al ${fechaLarga(fecha)}`,
      ``,
      `💵 *SALDO PENDIENTE: ${formatMoneda(opts.saldoPendiente)}*`,
      ``,
      // Las tres cifras tienen que cuadrar a la vista: antes se ponía el
      // capital prestado (sin intereses) junto al abonado y al saldo (que sí
      // los incluyen), y la resta no daba. El cliente saca la calculadora
      // justo en este documento, y una cuenta que no cierra le cuesta la
      // credibilidad a todo lo demás. El capital se muestra aparte, como
      // referencia de cuánto se le entregó.
      `🧮 Total a pagar: ${formatMoneda(totalAPagar)}`,
      `✅ Total abonado: ${formatMoneda(opts.totalAbonado)}`,
      `📌 _(de ${formatMoneda(opts.capitalPrestado)} que se te entregaron)_`,
      ``,
      LINEA,
      `📋 *${opts.contratas.length === 1 ? "TU CONTRATA ACTIVA" : "TUS CONTRATAS ACTIVAS"}*`,
      ``,
      ...detalle,
    ],
    cierre: [`🙏 ¡Gracias por tu preferencia!`, ``],
  });
}

/* ── Estado de cuenta de un deudor ──────────────────────────────────────── */

/** Abonos que se listan antes de resumir. */
const MAX_ABONOS = 8;

export function mensajeEstadoCuentaDeudor(opts: {
  nombreApp: string;
  nombre: string;
  deudaInicial: number;
  saldoActual: number;
  abonos: { fecha: Date; monto: number; restante: number }[];
  fecha?: Date;
}): string {
  const fecha = opts.fecha ?? new Date();
  const abonado = Math.round((opts.deudaInicial - opts.saldoActual) * 100) / 100;

  // Los más recientes primero: es lo que el deudor quiere confirmar.
  const recientes = [...opts.abonos].reverse();
  const visibles = recientes.slice(0, MAX_ABONOS);
  const restantes = recientes.length - visibles.length;

  const historial =
    visibles.length === 0
      ? [`📭 Todavía no hay abonos registrados.`, ``]
      : [
          ...visibles.map(
            (a) =>
              `✅ ${fechaCorta(a.fecha)} — *${formatMoneda(a.monto)}*  _(restante ${formatMoneda(a.restante)})_`
          ),
          ...(restantes > 0
            ? [`        ⋯ y ${restantes} abono${restantes === 1 ? "" : "s"} más`]
            : []),
          ``,
        ];

  return envolver({
    nombreApp: opts.nombreApp,
    icono: "📊",
    titulo: "Estado de cuenta",
    cuerpo: [
      `👤 *${opts.nombre}*`,
      `📅 Corte al ${fechaLarga(fecha)}`,
      ``,
      opts.saldoActual > 0
        ? `💵 *SALDO RESTANTE: ${formatMoneda(opts.saldoActual)}*`
        : `🎉 *¡DEUDA LIQUIDADA!*`,
      ``,
      `💰 Deuda inicial: ${formatMoneda(opts.deudaInicial)}`,
      `✅ Total abonado: ${formatMoneda(abonado)}`,
      ``,
      LINEA,
      `📋 *HISTORIAL DE ABONOS*`,
      ``,
      ...historial,
    ],
    cierre: [`🙏 ¡Gracias por tu preferencia!`, ``],
  });
}

/* ── Detalle de una contrata ────────────────────────────────────────────── */

export function mensajeDetalleContrata(opts: {
  nombreApp: string;
  clienteNombre: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  cuotasPagadas: number;
  numCuotas: number;
  saldo: number;
  atrasadas: { numeroCuota: number; fecha: Date }[];
  incompletas: { numeroCuota: number; montoAbonado: number; faltante: number }[];
  fecha?: Date;
}): string {
  const fecha = opts.fecha ?? new Date();
  const pendientes: string[] = [];

  if (opts.atrasadas.length > 0) {
    pendientes.push(LINEA, `⚠️ *CUOTAS ATRASADAS*`, ``);
    for (const a of opts.atrasadas) {
      pendientes.push(`🔸 Cuota ${a.numeroCuota} de ${opts.numCuotas} — venció el ${fechaCorta(a.fecha)}`);
    }
    pendientes.push(``);
  }

  if (opts.incompletas.length > 0) {
    pendientes.push(LINEA, `🟡 *CUOTAS INCOMPLETAS*`, ``);
    for (const i of opts.incompletas) {
      pendientes.push(
        `🔸 Cuota ${i.numeroCuota} de ${opts.numCuotas} — abonado ${formatMoneda(i.montoAbonado)}, falta *${formatMoneda(i.faltante)}*`
      );
    }
    pendientes.push(``);
  }

  return envolver({
    nombreApp: opts.nombreApp,
    icono: "📄",
    titulo: "Detalle de tu contrata",
    cuerpo: [
      `👤 *${opts.clienteNombre}*`,
      `📅 Corte al ${fechaLarga(fecha)}`,
      ``,
      opts.saldo > 0
        ? `💵 *TE RESTA POR PAGAR: ${formatMoneda(opts.saldo)}*`
        : `🎉 *¡CONTRATA LIQUIDADA!*`,
      ``,
      `📋 Tipo: *${TIPO_LABEL[opts.tipo]}*`,
      `💰 Monto prestado: ${formatMoneda(opts.monto)}`,
      `📆 Abono por cuota: ${formatMoneda(opts.abono)}`,
      `✅ Cuotas pagadas: *${opts.cuotasPagadas} de ${opts.numCuotas}*`,
      ``,
      ...pendientes,
    ],
    cierre: [`🙏 ¡Gracias por tu preferencia!`, ``],
  });
}
