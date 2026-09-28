import type { QueueOpType } from "@/lib/offline/db";

/**
 * Traducción de cada operación de la cola a su petición HTTP.
 *
 * Es la ÚNICA definición de cómo se manda una operación: la usan tanto el
 * vaciado de la cola como el guardado directo con señal (ver
 * `guardar.ts`). Así, si con señal la petición se cae a medio camino y la
 * operación se encola, lo que se reintenta es exactamente lo mismo que ya
 * se había mandado — mismo cuerpo, mismos ids, misma Idempotency-Key — y el
 * servidor la reconoce en vez de aplicarla dos veces.
 */

export type OperacionCola = { type: QueueOpType; payload: Record<string, unknown> };

export type Peticion = { url: string; init: RequestInit };

const PETICIONES: Record<
  QueueOpType,
  (payload: Record<string, unknown>) => { url: string; init: RequestInit }
> = {
  "contrata.pago.toggle": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/toggle`,
    init: { method: "POST" },
  }),
  "contrata.pago.abonar": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/abonar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: p.monto }),
    },
  }),
  "contrata.pago.revertir": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/abonar`,
    init: { method: "DELETE" },
  }),
  "contrata.marcarDeuda": (p) => ({
    url: `/api/contratas/${p.contrataId}/marcar-deuda`,
    init: { method: "POST" },
  }),
  "contrata.eliminar": (p) => ({
    url: `/api/contratas/${p.contrataId}`,
    init: { method: "DELETE" },
  }),
  "contrata.crear": (p) => ({
    url: `/api/contratas`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `_local` son las filas del efecto optimista, no van al servidor.
      body: JSON.stringify({ ...p, _local: undefined }),
    },
  }),
  "contrata.editar": (p) => ({
    url: `/api/contratas/${p.contrataId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "contrata.renovar": (p) => ({
    url: `/api/contratas/${p.contrataId}/renovar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "cliente.unificar": (p) => ({
    url: `/api/clientes/${p.clienteId}/unificar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contrataIds: p.contrataIds,
        ...(p.input as Record<string, unknown>),
      }),
    },
  }),
  "deudor.abonar": (p) => ({
    url: `/api/deudores/${p.deudorId}/abonos`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha: p.fecha, monto: p.monto, notas: p.notas }),
    },
  }),
  "cliente.cobrarVencidas": (p) => ({
    url: `/api/clientes/${p.clienteId}/cobrar-vencidas`,
    init: { method: "POST" },
  }),
  "cliente.abonarParcial": (p) => ({
    url: `/api/clientes/${p.clienteId}/abonar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: p.monto }),
    },
  }),
  "cita.crear": (p) => ({
    url: `/api/citas`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    },
  }),
  "cita.editar": (p) => ({
    url: `/api/citas/${p.citaId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "cita.cancelar": (p) => ({
    url: `/api/citas/${p.citaId}/cancelar`,
    init: { method: "POST" },
  }),
  "cita.entregar": (p) => ({
    url: `/api/citas/${p.citaId}/entregar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrataCreadaId: p.contrataCreadaId ?? null }),
    },
  }),
  // El `id` viaja en el cuerpo: el registro nace con su id definitivo, así
  // una contrata creada offline puede referenciar a un cliente también
  // creado offline sin tener que remapear ids al sincronizar.
  "cliente.crear": (p) => ({
    url: `/api/clientes`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    },
  }),
  "cliente.editar": (p) => ({
    url: `/api/clientes/${p.clienteId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "cliente.eliminar": (p) => ({
    url: `/api/clientes/${p.clienteId}`,
    init: { method: "DELETE" },
  }),
  "deudor.crear": (p) => ({
    url: `/api/deudores`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    },
  }),
  "deudor.editar": (p) => ({
    url: `/api/deudores/${p.deudorId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
};

export function peticionDe(op: OperacionCola): Peticion {
  return PETICIONES[op.type](op.payload);
}
