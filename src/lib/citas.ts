import { endOfWeek, format, isSameMonth, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { anclarFechaCliente } from "./fechas";

export type EstadoCita = "PENDIENTE" | "ENTREGADA" | "CANCELADA";
export type TipoCitaContrata =
  | "NUEVA"
  | "RENOVACION"
  | "UNIFICACION"
  | "SIN_DEFINIR";

/**
 * Estado visible en la UI: igual al `estado` persistido, salvo que una cita
 * `PENDIENTE` cuya `fechaEntrega` ya pasó se muestra como `ATRASADA` — nunca
 * se persiste así (sigue siendo `PENDIENTE` en la BD) para no perder la
 * distinción entre "vencida sin resolver" y "cancelada".
 */
export type EstadoCitaVista = EstadoCita | "ATRASADA";

export type CitaLike = {
  estado: EstadoCita;
  fechaEntrega: Date | string;
};

export function estadoCitaVista(
  cita: CitaLike,
  hoy: Date = new Date()
): EstadoCitaVista {
  if (cita.estado !== "PENDIENTE") return cita.estado;
  const entrega = anclarFechaCliente(cita.fechaEntrega);
  const base = anclarFechaCliente(hoy);
  return entrega < base ? "ATRASADA" : "PENDIENTE";
}

/**
 * Todas las citas pendientes (pestaña "Entregar" en Ruta) — orden
 * cronológico simple por fecha de entrega ascendente: las atrasadas más
 * viejas primero, luego hoy, luego las futuras más cercanas.
 */
export function citasPendientesOrdenadas<T extends CitaLike>(citas: T[]): T[] {
  return citas
    .filter((c) => c.estado === "PENDIENTE")
    .sort(
      (a, b) =>
        anclarFechaCliente(a.fechaEntrega).getTime() -
        anclarFechaCliente(b.fechaEntrega).getTime()
    );
}

/* ── Agrupación por semana (pestaña "Entregar" de Ruta) ─────────────────── */

export type PeriodicidadCita = "SEMANAL" | "QUINCENAL" | "MENSUAL";

/** Filtro del segmentado: `TODAS` no filtra; `SIN_DEFINIR` son las citas
 *  agendadas sin decidir cada cuánto pagará la contrata. */
export type FiltroPeriodicidad = "TODAS" | PeriodicidadCita | "SIN_DEFINIR";

export type CitaAgrupable = CitaLike & {
  montoEstimado: number;
  periodicidad?: PeriodicidadCita | null;
};

export type SemanaDeCitas<T> = {
  /** "2026-09-07" (lunes) — clave estable para React y para ordenar. */
  clave: string;
  /** "7 – 13 sep" · "28 sep – 4 oct" cuando la semana cruza de mes. */
  titulo: string;
  /** Suma de `montoEstimado` de las citas de la semana. */
  total: number;
  citas: T[];
};

/**
 * Rango de una semana en una sola línea: "7 – 13 sep", y con el mes en
 * ambos extremos cuando la semana cruza de mes ("28 sep – 4 oct"). Repetir
 * el mes cuando no cambia solo alarga el encabezado.
 */
function tituloSemana(inicio: Date, fin: Date): string {
  const dia = (d: Date) => format(d, "d", { locale: es });
  const diaMes = (d: Date) => format(d, "d MMM", { locale: es });
  return isSameMonth(inicio, fin)
    ? `${dia(inicio)} – ${diaMes(fin)}`
    : `${diaMes(inicio)} – ${diaMes(fin)}`;
}

/**
 * Parte las citas en secciones por semana calendario (lunes a domingo),
 * cada una con su total — el equivalente a las secciones con header de una
 * lista agrupada.
 *
 * Las atrasadas NO van a una sección aparte: caen en la semana que les
 * tocaba, que es donde el cobrador las busca cuando revisa "qué me quedó
 * pendiente de la semana pasada". Como la lista viene en orden
 * cronológico, esas semanas quedan arriba solas.
 *
 * Pura y exportada para poder probarla sin navegador (ver citas.test.ts).
 */
export function agruparCitasPorSemana<T extends CitaAgrupable>(
  citas: T[],
  filtro: FiltroPeriodicidad = "TODAS"
): SemanaDeCitas<T>[] {
  const filtradas =
    filtro === "TODAS"
      ? citas
      : citas.filter((c) =>
          filtro === "SIN_DEFINIR"
            ? !c.periodicidad
            : c.periodicidad === filtro
        );

  const porSemana = new Map<string, SemanaDeCitas<T>>();

  for (const cita of citasPendientesOrdenadas(filtradas)) {
    const fecha = anclarFechaCliente(cita.fechaEntrega);
    const inicio = startOfWeek(fecha, { weekStartsOn: 1 });
    const clave = format(inicio, "yyyy-MM-dd");

    const seccion = porSemana.get(clave);
    if (seccion) {
      seccion.citas.push(cita);
      seccion.total = Math.round((seccion.total + cita.montoEstimado) * 100) / 100;
    } else {
      porSemana.set(clave, {
        clave,
        titulo: tituloSemana(inicio, endOfWeek(fecha, { weekStartsOn: 1 })),
        total: cita.montoEstimado,
        citas: [cita],
      });
    }
  }

  // El Map preserva el orden de inserción, y las citas ya venían ordenadas
  // por fecha — así que las semanas salen cronológicas sin ordenar de nuevo.
  return Array.from(porSemana.values());
}
