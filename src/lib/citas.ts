import { anclarFechaCliente } from "./fechas";

export type EstadoCita = "PENDIENTE" | "ENTREGADA" | "CANCELADA";
export type TipoCitaContrata = "NUEVA" | "RENOVACION" | "SIN_DEFINIR";

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
 * Citas a mostrar como recordatorio del día en Ruta: pendientes cuya
 * `fechaEntrega` ya llegó (hoy o atrasada) — las futuras no se muestran
 * todavía. Ordenadas por fecha ascendente, la más atrasada primero.
 */
export function citasDelDia<T extends CitaLike>(
  citas: T[],
  hoy: Date = new Date()
): T[] {
  const base = anclarFechaCliente(hoy);
  return citas
    .filter((c) => {
      if (c.estado !== "PENDIENTE") return false;
      return anclarFechaCliente(c.fechaEntrega) <= base;
    })
    .sort(
      (a, b) =>
        anclarFechaCliente(a.fechaEntrega).getTime() -
        anclarFechaCliente(b.fechaEntrega).getTime()
    );
}
