import {
  addMonths,
  endOfMonth,
  endOfYear,
  format,
  isWithinInterval,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import type { TipoContrata } from "@prisma/client";
import {
  calcularScorePago,
  estadoContrata,
  saldoPendiente,
  type PagoConFecha,
  type ScorePago,
} from "@/lib/contrata";
import { anclarFechaCliente } from "@/lib/fechas";

/**
 * Estado de resultados: la foto completa del negocio en un período.
 *
 * Módulo PURO a propósito (no importa `@/lib/prisma`), igual que
 * `services/abono.ts`: la pantalla lo corre en el navegador sobre los datos
 * de IndexedDB (vía `offline/repo.ts`), así que el reporte funciona sin
 * señal y sin un round-trip al servidor. Toda la aritmética de dinero vive
 * aquí y se prueba con Vitest, no en el componente.
 *
 * Dos horizontes distintos conviven en el reporte, y conviene no
 * confundirlos:
 *  - CARTERA: una foto de HOY (qué hay en la calle en este momento). No
 *    depende del período elegido.
 *  - RESULTADO: el flujo DENTRO del período elegido (qué se colocó, qué se
 *    cobró, cuánto de eso fue ganancia).
 */

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

export type PagoParaEstado = {
  pagado: boolean;
  montoAbonado: number;
  fechaProgramada: Date;
  fechaPago: Date | null;
};

export type ContrataParaEstado = {
  clienteId: string;
  clienteNombre: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  fechaInicio: Date;
  convertidaADeuda: boolean;
  pagos: PagoParaEstado[];
};

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export type PeriodoEstado = "MES" | "TRIMESTRE" | "ANIO" | "HISTORICO";

export type RangoPeriodo = {
  periodo: PeriodoEstado;
  /** "Septiembre 2026", "Últimos 3 meses", … — para el encabezado. */
  label: string;
  /**
   * El mismo período pero escrito para meterlo en una oración: "En
   * septiembre 2026…", "En todo el histórico…". Sin esto, bajar `label` a
   * minúsculas produce frases rotas como "En histórico entregaste".
   */
  frase: string;
  /** `null` en histórico (sin recorte). */
  desde: string | null;
  hasta: string | null;
};

/** Foto de hoy: qué hay en la calle en este momento. */
export type Cartera = {
  capitalActivo: number;
  contratasActivas: number;
  clientesActivos: number;
  saldoPendiente: number;
  /** Saldo de las contratas cuyo estado es VENCIDO — la parte en riesgo. */
  saldoEnRiesgo: number;
  /** Capital promedio por contrata activa. */
  ticketPromedio: number;
  /** % de contratas activas en estado VENCIDO. */
  morosidad: number;
  /** Promedio de días de atraso de las cuotas que se pagaron tarde. `null` si no hay historial. */
  diasPromedioAtraso: number | null;
  alCorriente: number;
  proximas: number;
  vencidas: number;
};

/** Flujo dentro del período elegido. */
export type Resultado = {
  /** Capital entregado en contratas iniciadas dentro del período. */
  colocado: number;
  numColocadas: number;
  /** Dinero efectivamente cobrado dentro del período. */
  cobrado: number;
  /** Parte de lo cobrado que es interés (la ganancia real). */
  ganancia: number;
  /** Parte de lo cobrado que es capital que regresa. */
  capitalRecuperado: number;
  /** Ganancia / cobrado — cuánto de cada peso cobrado es utilidad. */
  margen: number;
  /** Ganancia del período sobre el capital hoy en la calle. */
  rendimientoSobreCapital: number;
};

/** Totales de toda la vida del negocio, sin importar el período elegido. */
export type Historico = {
  colocado: number;
  numContratas: number;
  cobrado: number;
  ganancia: number;
  /** Cobrado / (cobrado + saldo pendiente) — qué tanto de lo pactado ya entró. */
  tasaRecuperacion: number;
  clientesTotales: number;
  contratasLiquidadas: number;
  contratasEnDeuda: number;
};

export type ResumenTipo = {
  tipo: TipoContrata;
  label: string;
  contratasActivas: number;
  capitalActivo: number;
  saldoPendiente: number;
  colocado: number;
  numColocadas: number;
  cobrado: number;
  ganancia: number;
  vencidas: number;
  morosidad: number;
  /** % del capital activo total que representa este tipo — para la gráfica de dona. */
  porcentajeCapital: number;
};

export type MesEstado = {
  /** "2026-09" — para ordenar. */
  mes: string;
  /** "sep 2026" — para mostrar. */
  label: string;
  colocado: number;
  cobrado: number;
  ganancia: number;
};

export type ClienteMonto = {
  clienteId: string;
  nombre: string;
  capitalActivo: number;
  saldoPendiente: number;
  contratasActivas: number;
};

export type ClientePuntual = {
  clienteId: string;
  nombre: string;
  score: ScorePago;
  porcentajeATiempo: number;
  diasPromedioAtraso: number;
  cuotasConsideradas: number;
};

export type EstadoResultados = {
  rango: RangoPeriodo;
  cartera: Cartera;
  resultado: Resultado;
  historico: Historico;
  porTipo: ResumenTipo[];
  serie: MesEstado[];
  topPorMonto: ClienteMonto[];
  topPorPuntualidad: ClientePuntual[];
  /** Lectura en prosa de los números de arriba — un párrafo por idea. */
  narrativa: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Porcentaje con un decimal, blindado contra divisiones entre cero. */
function pct(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

const LABEL_TIPO: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

/** Para la prosa: "contratas semanales", no "contratas semanal". */
const ADJETIVO_TIPO: Record<TipoContrata, string> = {
  SEMANAL: "semanales",
  QUINCENAL: "quincenales",
  MENSUAL: "mensuales",
};

const TIPOS: TipoContrata[] = ["SEMANAL", "QUINCENAL", "MENSUAL"];

/**
 * Mínimo de cuotas pagadas para entrar al ranking de puntualidad: con una
 * o dos cuotas cualquiera sale con 100% y el top se llena de clientes
 * nuevos en vez de los que de verdad tienen historial.
 */
export const MIN_CUOTAS_PUNTUALIDAD = 3;

export function rangoDePeriodo(
  periodo: PeriodoEstado,
  hoy: Date = new Date()
): RangoPeriodo {
  if (periodo === "HISTORICO") {
    return {
      periodo,
      label: "Histórico",
      frase: "en todo el histórico",
      desde: null,
      hasta: null,
    };
  }
  if (periodo === "MES") {
    const desde = startOfMonth(hoy);
    const label = format(desde, "MMMM yyyy", { locale: es });
    return {
      periodo,
      label,
      frase: `en ${label.toLowerCase()}`,
      desde: desde.toISOString(),
      hasta: endOfMonth(hoy).toISOString(),
    };
  }
  if (periodo === "TRIMESTRE") {
    const desde = startOfMonth(subMonths(hoy, 2));
    return {
      periodo,
      label: "Últimos 3 meses",
      frase: "en los últimos 3 meses",
      desde: desde.toISOString(),
      hasta: endOfMonth(hoy).toISOString(),
    };
  }
  const desde = startOfYear(hoy);
  const anio = format(hoy, "yyyy");
  return {
    periodo,
    label: `Año ${anio}`,
    frase: `en lo que va de ${anio}`,
    desde: desde.toISOString(),
    hasta: endOfYear(hoy).toISOString(),
  };
}

function dentroDelRango(fecha: Date, rango: RangoPeriodo): boolean {
  if (!rango.desde || !rango.hasta) return true;
  return isWithinInterval(fecha, {
    start: new Date(rango.desde),
    end: new Date(rango.hasta),
  });
}

// ---------------------------------------------------------------------------
// Agregación
// ---------------------------------------------------------------------------

type AcumuladorTipo = {
  contratasActivas: number;
  capitalActivo: number;
  saldoPendiente: number;
  colocado: number;
  numColocadas: number;
  cobrado: number;
  ganancia: number;
  vencidas: number;
};

function nuevoAcumuladorTipo(): AcumuladorTipo {
  return {
    contratasActivas: 0,
    capitalActivo: 0,
    saldoPendiente: 0,
    colocado: 0,
    numColocadas: 0,
    cobrado: 0,
    ganancia: 0,
    vencidas: 0,
  };
}

/**
 * Arma el estado de resultados completo. `contratas` debe traer TODAS las
 * del espacio de trabajo (activas, liquidadas y convertidas a deuda): el
 * dinero ya cobrado cuenta para el histórico aunque la contrata ya no esté
 * viva, igual que en `aggregateKpis`.
 */
export function aggregarEstadoResultados(
  contratas: ContrataParaEstado[],
  periodo: PeriodoEstado = "MES",
  hoy: Date = new Date(),
  mesesSerie: number = 12
): EstadoResultados {
  const rango = rangoDePeriodo(periodo, hoy);

  // --- Serie mensual (siempre los últimos `mesesSerie`, independiente del
  // período elegido: la gráfica es para ver la tendencia, no el corte).
  const inicioMesActual = startOfMonth(hoy);
  const serie: MesEstado[] = Array.from({ length: mesesSerie }, (_, i) => {
    const d = addMonths(inicioMesActual, -(mesesSerie - 1) + i);
    return {
      mes: format(d, "yyyy-MM"),
      label: format(d, "MMM yy", { locale: es }),
      colocado: 0,
      cobrado: 0,
      ganancia: 0,
    };
  });
  const serePorMes = new Map(serie.map((m) => [m.mes, m]));
  const primerMesSerie = serie[0].mes;

  const porTipo = new Map<TipoContrata, AcumuladorTipo>(
    TIPOS.map((t) => [t, nuevoAcumuladorTipo()])
  );

  // Cartera (foto de hoy)
  let capitalActivo = 0;
  let contratasActivas = 0;
  let saldoTotal = 0;
  let saldoEnRiesgo = 0;
  let alCorriente = 0;
  let proximas = 0;
  let vencidas = 0;
  let contratasLiquidadas = 0;
  let contratasEnDeuda = 0;

  // Resultado del período
  let colocadoPeriodo = 0;
  let numColocadasPeriodo = 0;
  let cobradoPeriodo = 0;
  let gananciaPeriodo = 0;

  // Histórico
  let colocadoTotal = 0;
  let cobradoTotal = 0;
  let gananciaTotal = 0;
  let diasAtrasoSuma = 0;
  let diasAtrasoCasos = 0;
  let huboCuotasPagadas = false;

  const clientesActivos = new Set<string>();
  const clientesTotales = new Set<string>();
  const montoPorCliente = new Map<string, ClienteMonto>();
  const pagosPorCliente = new Map<
    string,
    { nombre: string; pagos: PagoConFecha[] }
  >();

  for (const c of contratas) {
    clientesTotales.add(c.clienteId);
    const acum = porTipo.get(c.tipo) ?? nuevoAcumuladorTipo();

    // Cuánto de cada peso cobrado es interés: el total pactado
    // (abono × numCuotas) menos el capital prestado es el interés del
    // trato, y se asume que cada abono trae esa misma proporción. Misma
    // regla que usa el dashboard y el corte de caja — deliberadamente, para
    // que los tres reportes den el mismo número.
    const totalPactado = c.abono * c.numCuotas;
    const interesPactado = Math.max(totalPactado - c.monto, 0);
    const proporcionInteres = totalPactado > 0 ? interesPactado / totalPactado : 0;

    // --- Colocación (capital entregado)
    const inicio = anclarFechaCliente(c.fechaInicio);
    colocadoTotal = round(colocadoTotal + c.monto);
    if (dentroDelRango(inicio, rango)) {
      colocadoPeriodo = round(colocadoPeriodo + c.monto);
      numColocadasPeriodo += 1;
      acum.colocado = round(acum.colocado + c.monto);
      acum.numColocadas += 1;
    }
    const claveInicio = format(inicio, "yyyy-MM");
    if (claveInicio >= primerMesSerie) {
      const bucket = serePorMes.get(claveInicio);
      if (bucket) bucket.colocado = round(bucket.colocado + c.monto);
    }

    // --- Cobranza
    const pagosCliente = pagosPorCliente.get(c.clienteId) ?? {
      nombre: c.clienteNombre,
      pagos: [],
    };
    for (const p of c.pagos) {
      pagosCliente.pagos.push({
        pagado: p.pagado,
        fechaProgramada: p.fechaProgramada,
        fechaPago: p.fechaPago,
      });
      if (!p.pagado || !p.fechaPago) continue;
      huboCuotasPagadas = true;
      const interes = p.montoAbonado * proporcionInteres;

      cobradoTotal = round(cobradoTotal + p.montoAbonado);
      gananciaTotal = round(gananciaTotal + interes);

      if (dentroDelRango(p.fechaPago, rango)) {
        cobradoPeriodo = round(cobradoPeriodo + p.montoAbonado);
        gananciaPeriodo = round(gananciaPeriodo + interes);
        acum.cobrado = round(acum.cobrado + p.montoAbonado);
        acum.ganancia = round(acum.ganancia + interes);
      }

      const claveCobro = format(p.fechaPago, "yyyy-MM");
      if (claveCobro >= primerMesSerie) {
        const bucket = serePorMes.get(claveCobro);
        if (bucket) {
          bucket.cobrado = round(bucket.cobrado + p.montoAbonado);
          bucket.ganancia = round(bucket.ganancia + interes);
        }
      }

      const diasAtraso = Math.round(
        (p.fechaPago.getTime() -
          anclarFechaCliente(p.fechaProgramada).getTime()) /
          86400000
      );
      if (diasAtraso > 0) {
        diasAtrasoSuma += diasAtraso;
        diasAtrasoCasos += 1;
      }
    }
    pagosPorCliente.set(c.clienteId, pagosCliente);

    // --- Cartera: solo lo que sigue vivo hoy.
    if (c.convertidaADeuda) {
      contratasEnDeuda += 1;
      porTipo.set(c.tipo, acum);
      continue;
    }
    const activa = c.pagos.some((p) => !p.pagado);
    if (!activa) {
      contratasLiquidadas += 1;
      porTipo.set(c.tipo, acum);
      continue;
    }

    const saldo = saldoPendiente(c.pagos, c.abono);
    const estado = estadoContrata(c.pagos, hoy);

    contratasActivas += 1;
    capitalActivo = round(capitalActivo + c.monto);
    saldoTotal = round(saldoTotal + saldo);
    clientesActivos.add(c.clienteId);

    acum.contratasActivas += 1;
    acum.capitalActivo = round(acum.capitalActivo + c.monto);
    acum.saldoPendiente = round(acum.saldoPendiente + saldo);

    if (estado === "VENCIDO") {
      vencidas += 1;
      acum.vencidas += 1;
      saldoEnRiesgo = round(saldoEnRiesgo + saldo);
    } else if (estado === "PROXIMO") {
      proximas += 1;
    } else {
      alCorriente += 1;
    }

    const delCliente = montoPorCliente.get(c.clienteId) ?? {
      clienteId: c.clienteId,
      nombre: c.clienteNombre,
      capitalActivo: 0,
      saldoPendiente: 0,
      contratasActivas: 0,
    };
    delCliente.capitalActivo = round(delCliente.capitalActivo + c.monto);
    delCliente.saldoPendiente = round(delCliente.saldoPendiente + saldo);
    delCliente.contratasActivas += 1;
    montoPorCliente.set(c.clienteId, delCliente);

    porTipo.set(c.tipo, acum);
  }

  const cartera: Cartera = {
    capitalActivo,
    contratasActivas,
    clientesActivos: clientesActivos.size,
    saldoPendiente: saldoTotal,
    saldoEnRiesgo,
    ticketPromedio:
      contratasActivas > 0 ? round(capitalActivo / contratasActivas) : 0,
    morosidad: pct(vencidas, contratasActivas),
    diasPromedioAtraso: !huboCuotasPagadas
      ? null
      : diasAtrasoCasos === 0
        ? 0
        : Math.round((diasAtrasoSuma / diasAtrasoCasos) * 10) / 10,
    alCorriente,
    proximas,
    vencidas,
  };

  const resultado: Resultado = {
    colocado: colocadoPeriodo,
    numColocadas: numColocadasPeriodo,
    cobrado: cobradoPeriodo,
    ganancia: gananciaPeriodo,
    capitalRecuperado: round(cobradoPeriodo - gananciaPeriodo),
    margen: pct(gananciaPeriodo, cobradoPeriodo),
    rendimientoSobreCapital: pct(gananciaPeriodo, capitalActivo),
  };

  const historico: Historico = {
    colocado: colocadoTotal,
    numContratas: contratas.length,
    cobrado: cobradoTotal,
    ganancia: gananciaTotal,
    tasaRecuperacion: pct(cobradoTotal, cobradoTotal + saldoTotal),
    clientesTotales: clientesTotales.size,
    contratasLiquidadas,
    contratasEnDeuda,
  };

  const resumenTipos: ResumenTipo[] = TIPOS.map((tipo) => {
    const a = porTipo.get(tipo) ?? nuevoAcumuladorTipo();
    return {
      tipo,
      label: LABEL_TIPO[tipo],
      contratasActivas: a.contratasActivas,
      capitalActivo: a.capitalActivo,
      saldoPendiente: a.saldoPendiente,
      colocado: a.colocado,
      numColocadas: a.numColocadas,
      cobrado: a.cobrado,
      ganancia: a.ganancia,
      vencidas: a.vencidas,
      morosidad: pct(a.vencidas, a.contratasActivas),
      porcentajeCapital: pct(a.capitalActivo, capitalActivo),
    };
  });

  const topPorMonto = Array.from(montoPorCliente.values())
    .sort(
      (a, b) =>
        b.capitalActivo - a.capitalActivo ||
        b.saldoPendiente - a.saldoPendiente ||
        a.nombre.localeCompare(b.nombre)
    )
    .slice(0, 5);

  const topPorPuntualidad: ClientePuntual[] = Array.from(
    pagosPorCliente.entries()
  )
    .map(([clienteId, { nombre, pagos }]) => {
      const s = calcularScorePago(pagos);
      return {
        clienteId,
        nombre,
        score: s.score,
        porcentajeATiempo: s.porcentajeATiempo,
        diasPromedioAtraso: s.diasPromedioAtraso,
        cuotasConsideradas: s.cuotasConsideradas,
      };
    })
    .filter((c) => c.cuotasConsideradas >= MIN_CUOTAS_PUNTUALIDAD)
    .sort(
      (a, b) =>
        b.porcentajeATiempo - a.porcentajeATiempo ||
        a.diasPromedioAtraso - b.diasPromedioAtraso ||
        b.cuotasConsideradas - a.cuotasConsideradas ||
        a.nombre.localeCompare(b.nombre)
    )
    .slice(0, 5);

  return {
    rango,
    cartera,
    resultado,
    historico,
    porTipo: resumenTipos,
    serie,
    topPorMonto,
    topPorPuntualidad,
    narrativa: construirNarrativa({
      rango,
      cartera,
      resultado,
      historico,
      porTipo: resumenTipos,
      serie,
    }),
  };
}

// ---------------------------------------------------------------------------
// Narrativa
// ---------------------------------------------------------------------------

function moneda(n: number): string {
  return `$${Math.round(n).toLocaleString("es-MX")}`;
}

/** "1 contrata" / "3 contratas" — el reporte lo lee una persona, no un log. */
function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Traduce los números a prosa. No inventa nada que no esté en los datos:
 * cada frase sale de un valor ya calculado arriba, y las comparaciones
 * (mes contra mes anterior) usan la misma serie que dibuja la gráfica.
 */
export function construirNarrativa(d: {
  rango: RangoPeriodo;
  cartera: Cartera;
  resultado: Resultado;
  historico: Historico;
  porTipo: ResumenTipo[];
  serie: MesEstado[];
}): string[] {
  const { cartera, resultado, historico, rango } = d;
  const parrafos: string[] = [];

  if (cartera.contratasActivas === 0 && historico.numContratas === 0) {
    return [
      "Todavía no hay contratas registradas, así que no hay resultados que mostrar. En cuanto entregues la primera, este reporte se llena solo.",
    ];
  }

  // 1) La cartera hoy.
  const periodoTxt = rango.frase;
  parrafos.push(
    cartera.contratasActivas === 0
      ? `Hoy no tienes contratas activas: todo lo colocado está liquidado o pasó a deudores. Históricamente entregaste ${moneda(historico.colocado)} en ${plural(historico.numContratas, "contrata", "contratas")} y cobraste ${moneda(historico.cobrado)}.`
      : `Hoy tienes ${moneda(cartera.capitalActivo)} en la calle, repartidos en ${plural(cartera.contratasActivas, "contrata activa", "contratas activas")} de ${plural(cartera.clientesActivos, "cliente", "clientes")} (promedio de ${moneda(cartera.ticketPromedio)} por contrata). Te falta cobrar ${moneda(cartera.saldoPendiente)} de esas contratas.`
  );

  // 2) El resultado del período.
  if (resultado.cobrado > 0 || resultado.colocado > 0) {
    const detalleGanancia =
      resultado.cobrado > 0
        ? ` De lo cobrado, ${moneda(resultado.ganancia)} es ganancia (interés) y ${moneda(resultado.capitalRecuperado)} es capital que regresó — un margen de ${resultado.margen}%.`
        : "";
    parrafos.push(
      `${periodoTxt.charAt(0).toUpperCase() + periodoTxt.slice(1)} entregaste ${moneda(resultado.colocado)} en ${plural(resultado.numColocadas, "contrata nueva", "contratas nuevas")} y cobraste ${moneda(resultado.cobrado)}.${detalleGanancia}`
    );
  } else {
    parrafos.push(
      `${periodoTxt.charAt(0).toUpperCase() + periodoTxt.slice(1)} todavía no hay movimiento: ni contratas nuevas ni cobranza registrada.`
    );
  }

  // 3) Salud de la cobranza.
  if (cartera.contratasActivas > 0) {
    const salud =
      cartera.morosidad === 0
        ? `Ninguna contrata activa está vencida: la cartera va al corriente.`
        : cartera.morosidad <= 15
          ? `La morosidad está en ${cartera.morosidad}% (${cartera.vencidas} de ${plural(cartera.contratasActivas, "contrata", "contratas")}), un nivel manejable.`
          : `Atención a la morosidad: ${cartera.morosidad}% de la cartera está vencida (${cartera.vencidas} de ${plural(cartera.contratasActivas, "contrata", "contratas")}), con ${moneda(cartera.saldoEnRiesgo)} en riesgo.`;
    const atraso =
      cartera.diasPromedioAtraso === null
        ? ""
        : cartera.diasPromedioAtraso === 0
          ? " Cuando pagan, pagan a tiempo: no hay atrasos en el historial."
          : ` Cuando se atrasan, lo hacen ${cartera.diasPromedioAtraso} ${cartera.diasPromedioAtraso === 1 ? "día" : "días"} en promedio.`;
    parrafos.push(salud + atraso);
  }

  // 4) Qué tipo de contrata está moviendo el negocio.
  const conCapital = d.porTipo.filter((t) => t.capitalActivo > 0);
  if (conCapital.length > 0) {
    const dominante = conCapital.reduce((a, b) =>
      b.capitalActivo > a.capitalActivo ? b : a
    );
    const resto = conCapital
      .filter((t) => t.tipo !== dominante.tipo)
      .map((t) => `${ADJETIVO_TIPO[t.tipo]} ${t.porcentajeCapital}%`)
      .join(" y ");
    parrafos.push(
      `El grueso del capital está en contratas ${ADJETIVO_TIPO[dominante.tipo]}: ${moneda(dominante.capitalActivo)} (${dominante.porcentajeCapital}% del total)${resto ? `, seguido de ${resto}` : ""}.`
    );
  }

  // 5) Acumulado histórico.
  parrafos.push(
    `Desde el inicio has colocado ${moneda(historico.colocado)} en ${plural(historico.numContratas, "contrata", "contratas")} y recuperado ${moneda(historico.cobrado)}, de los cuales ${moneda(historico.ganancia)} son ganancia. Llevas cobrado el ${historico.tasaRecuperacion}% de todo lo que has puesto a cobrar.`
  );

  return parrafos;
}
