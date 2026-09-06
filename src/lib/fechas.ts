import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  getDate,
  getDay,
  lastDayOfMonth,
  setDate,
  startOfDay,
  subMonths,
} from "date-fns";
import type { ModoQuincenal, TipoContrata } from "@prisma/client";

/**
 * Ancla una fecha a su día calendario en hora LOCAL, tomando el año/mes/día
 * en UTC como referencia. Evita que fechas "solo fecha" (ej. las que llegan
 * como "2026-07-15" desde un <input type=date>, parseadas como medianoche
 * UTC) se corran un día hacia atrás al operar con funciones de date-fns que
 * usan la zona horaria local del servidor (p. ej. en un servidor en
 * America/Mexico_City, UTC-6).
 */
function anclarFecha(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Ancla una fecha (o ISO string) a su año/mes/día en UTC para mostrarla en
 * el navegador sin que la zona horaria local del cliente la corra un día.
 * Usar en el cliente en vez de `new Date(iso)` al formatear fechas que
 * vienen del servidor como fecha calendario (ISO a medianoche UTC).
 */
export function anclarFechaCliente(d: Date | string): Date {
  const fecha = typeof d === "string" ? new Date(d) : d;
  return new Date(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

/**
 * Ajusta una fecha al día de la semana configurado como día de cobro
 * (0=domingo..6=sábado), moviéndola al día correspondiente de esa misma
 * semana. Así toda la serie de cuotas semanales cae siempre en el mismo día
 * (p. ej. todas en lunes, o todas en sábado si así lo configura el usuario).
 */
export function alinearADiaCobro(d: Date, diaCobro: number): Date {
  const dia = getDay(d);
  const diff = diaCobro - dia;
  return startOfDay(addDays(d, diff));
}

/**
 * Dada una fecha, devuelve la siguiente "quincena" en modo días 15 / último:
 *  - antes del 15  → día 15 del mismo mes
 *  - entre 15 y penúltimo → último día del mismo mes
 *  - último día → día 15 del mes siguiente
 */
function siguienteQuincenaFija(desde: Date): Date {
  const dia = getDate(desde);
  const ultimo = getDate(lastDayOfMonth(desde));
  if (dia < 15) return setDate(desde, 15);
  if (dia < ultimo) return lastDayOfMonth(desde);
  return setDate(addMonths(desde, 1), 15);
}

/**
 * Dada una fecha, devuelve la siguiente "quincena" en modo días 1 y 15:
 *  - antes del 15 → día 15 del mismo mes
 *  - del 15 en adelante → día 1 del mes siguiente
 */
function siguienteQuincenaDia1y15(desde: Date): Date {
  const dia = getDate(desde);
  if (dia < 15) return setDate(desde, 15);
  return setDate(addMonths(desde, 1), 1);
}

/** El candidato de `candidatos` cuya distancia en días a `desde` es menor
 *  (empate → gana el que aparece primero en la lista). */
function masCercana(desde: Date, candidatos: Date[]): Date {
  return candidatos.reduce((mejor, c) =>
    Math.abs(differenceInCalendarDays(c, desde)) <
    Math.abs(differenceInCalendarDays(mejor, desde))
      ? c
      : mejor
  );
}

/**
 * Alinea una fecha a la quincena fija (días 15 / último) más cercana —
 * mismo espíritu que `alinearADiaCobro` para semanal: la cuota 1 puede
 * moverse uno o dos días hacia adelante o hacia atrás para caer justo en
 * el ancla, en vez de quedarse en una fecha suelta a un día de distancia
 * (eso es lo que generaba dos cuotas casi pegadas: cuota 1 sin alinear +
 * cuota 2 ya alineada por `siguienteQuincenaFija`).
 */
function alinearAQuincenaFija(desde: Date): Date {
  return masCercana(desde, [
    lastDayOfMonth(subMonths(desde, 1)),
    setDate(desde, 15),
    lastDayOfMonth(desde),
    setDate(addMonths(desde, 1), 15),
  ]);
}

/** Igual que `alinearAQuincenaFija`, para el modo días 1 y 15. */
function alinearADia1y15(desde: Date): Date {
  return masCercana(desde, [
    setDate(desde, 1),
    setDate(desde, 15),
    setDate(addMonths(desde, 1), 1),
  ]);
}

/**
 * Calcula las fechas programadas de todas las cuotas.
 *
 * La cuota 1 ES la fecha de inicio (o su versión alineada, según el modo):
 * `fechaInicio` es literalmente la fecha en la que se paga el primer pago
 * de la contrata, no una fecha previa a partir de la cual se cuenta un
 * período extra. Las cuotas siguientes se calculan sumando la periodicidad
 * a partir de la cuota anterior.
 *
 * `diaCobroSemanal` (0=domingo..6=sábado) alinea la cuota 1 semanal al día
 * de cobro configurado, para que todas las cuotas caigan en ese mismo día
 * de la semana.
 */
export function calcularFechasPago(
  tipo: TipoContrata,
  modoQuincenal: ModoQuincenal,
  fechaInicio: Date,
  numCuotas: number,
  diaCobroSemanal: number = 1
): Date[] {
  const fechas: Date[] = [];
  const fechaAnclada = anclarFecha(fechaInicio);

  if (tipo === "SEMANAL") {
    const cuota1 = alinearADiaCobro(fechaAnclada, diaCobroSemanal);
    for (let n = 0; n < numCuotas; n++) {
      fechas.push(addDays(cuota1, n * 7));
    }
    return fechas;
  }

  const inicio = startOfDay(fechaAnclada);

  if (tipo === "MENSUAL") {
    for (let n = 0; n < numCuotas; n++) {
      fechas.push(addMonths(inicio, n));
    }
    return fechas;
  }

  // QUINCENAL
  if (modoQuincenal === "QUINCE_DIAS") {
    for (let n = 0; n < numCuotas; n++) {
      fechas.push(addDays(inicio, n * 15));
    }
    return fechas;
  }

  // QUINCENAL modo días 1 y 15
  if (modoQuincenal === "DIAS_1_Y_15") {
    let cursor = alinearADia1y15(inicio);
    fechas.push(cursor);
    for (let n = 1; n < numCuotas; n++) {
      cursor = siguienteQuincenaDia1y15(cursor);
      fechas.push(cursor);
    }
    return fechas;
  }

  // QUINCENAL modo días 15 y último
  let cursor = alinearAQuincenaFija(inicio);
  fechas.push(cursor);
  for (let n = 1; n < numCuotas; n++) {
    cursor = siguienteQuincenaFija(cursor);
    fechas.push(cursor);
  }
  return fechas;
}
