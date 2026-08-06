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
