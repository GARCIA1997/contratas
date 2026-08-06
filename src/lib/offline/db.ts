import Dexie, { type EntityTable } from "dexie";
import type { TipoContrata } from "@prisma/client";

/**
 * Espejo local (IndexedDB) de los modelos de dominio. Es un solo store por
 * dispositivo/navegador — no por usuario — así que `ownerId` se filtra
 * siempre en la capa de repositorio (nunca leer sin scope). Al cambiar de
 * cuenta en el mismo dispositivo, `session-guard.ts` vacía todo antes de
 * hidratar al nuevo usuario.
 */

export type ClienteLocal = {
  id: string;
  ownerId: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
  notas: string | null;
  creadoEn: string;
  _dirty?: boolean;
  _deletedAt?: string | null;
};

export type PagoLocal = {
  id: string;
  contrataId: string;
  ownerId: string;
  numeroCuota: number;
  fechaProgramada: string;
  fechaPago: string | null;
  pagado: boolean;
  montoAbonado: number;
};

export type ContrataLocal = {
  id: string;
  ownerId: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  fechaInicio: string;
  numCuotas: number;
  mes: string;
  notas: string | null;
  convertidaADeuda: boolean;
  deudorId: string | null;
  creadoEn: string;
  _dirty?: boolean;
  _deletedAt?: string | null;
};

export type DeudorLocal = {
  id: string;
  ownerId: string;
  nombre: string;
  deudaInicial: number;
  notas: string | null;
  creadoEn: string;
  /** Snapshot calculado por el servidor (lista /api/deudores); no se recalcula
   * localmente para la lista — solo el detalle usa las filas de abonosDeudor. */
  saldoActual: number;
  numAbonos: number;
  _dirty?: boolean;
  _deletedAt?: string | null;
};

export type AbonoDeudorLocal = {
  id: string;
  deudorId: string;
  ownerId: string;
  fecha: string;
  monto: number;
  restante: number;
  notas: string | null;
};

export type ConfiguracionLocal = {
  ownerId: string; // clave primaria: 1 por owner
  nombreApp: string;
  tasaSemanal: number;
  tasaQuincenal: number;
  tasaMensual: number;
  cuotasPorDefecto: number;
  maxCuotas: number;
  modoFechasQuincenal: string;
  diaCobroSemanal: number;
  colorPrimario: string;
  logoUrl: string | null;
};

export type MetaLocal = {
  key: string;
  value: unknown;
};

export type EstadoCitaLocal = "PENDIENTE" | "ENTREGADA" | "CANCELADA";
export type TipoCitaLocal = "NUEVA" | "RENOVACION" | "SIN_DEFINIR";

export type CitaLocal = {
  id: string;
  ownerId: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  contrataOrigenId: string | null;
  contrataCreadaId: string | null;
  tipo: TipoCitaLocal;
  montoEstimado: number;
  fechaEntrega: string;
  notas: string | null;
  estado: EstadoCitaLocal;
  creadoEn: string;
  _dirty?: boolean;
  _deletedAt?: string | null;
};

export type QueueStatus =
  | "pending"
  | "syncing"
  | "failed"
  | "conflict"
  | "blocked";

export type QueueOpType =
  | "contrata.pago.toggle"
  | "contrata.pago.abonar"
  | "contrata.pago.revertir"
  | "contrata.marcarDeuda"
  | "contrata.eliminar"
  | "contrata.crear"
  | "contrata.editar"
  | "contrata.renovar"
  | "cliente.unificar"
  | "deudor.abonar"
  | "cliente.cobrarVencidas"
  | "cita.crear"
  | "cita.editar"
  | "cita.cancelar"
  | "cita.entregar";

export type WriteQueueItem = {
  id: string; // idempotency key (uuid)
  ownerId: string;
  type: QueueOpType;
  payload: Record<string, unknown>;
  createdAt: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string | null;
};

class KrediredDB extends Dexie {
  clientes!: EntityTable<ClienteLocal, "id">;
  contratas!: EntityTable<ContrataLocal, "id">;
  pagos!: EntityTable<PagoLocal, "id">;
  deudores!: EntityTable<DeudorLocal, "id">;
  abonosDeudor!: EntityTable<AbonoDeudorLocal, "id">;
  configuracion!: EntityTable<ConfiguracionLocal, "ownerId">;
  meta!: EntityTable<MetaLocal, "key">;
  writeQueue!: EntityTable<WriteQueueItem, "id">;
  citas!: EntityTable<CitaLocal, "id">;

  constructor() {
    super("kredired-offline");
    this.version(1).stores({
      clientes: "id, ownerId",
      contratas: "id, ownerId, clienteId, [ownerId+tipo]",
      pagos: "id, contrataId, ownerId",
      deudores: "id, ownerId",
      abonosDeudor: "id, deudorId, ownerId",
      configuracion: "ownerId",
      meta: "key",
      writeQueue: "id, ownerId, status, createdAt",
    });
    this.version(2).stores({
      citas: "id, ownerId, clienteId, [ownerId+estado+fechaEntrega]",
    });
  }
}

// Una sola instancia; en SSR (build/RSC) Dexie no debe inicializarse.
export const db: KrediredDB | null =
  typeof window !== "undefined" ? new KrediredDB() : null;
