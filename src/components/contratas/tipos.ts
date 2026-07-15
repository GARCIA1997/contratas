import type { EstadoContrata } from "@/lib/contrata";
import type { TipoContrata } from "@prisma/client";

/** Resumen serializable de una contrata para la lista. */
export type ContrataResumen = {
  id: string;
  clienteNombre: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  pagados: number;
  total: number;
  saldo: number;
  estado: EstadoContrata;
  creadoEn: string;
};
