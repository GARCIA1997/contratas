import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TipoContrata } from "@prisma/client";
import { db, type ContrataLocal, type PagoLocal } from "@/lib/offline/db";
import { calcularFechasPago } from "@/lib/fechas";
import { calcularAbono, cuotasVencidasOVigentes } from "@/lib/contrata";
import { CONFIG_DEFAULTS, type ConfigView } from "@/lib/config";
import { getConfiguracion } from "@/lib/offline/repo";
import { debeTrabajarLocal, fetchConTimeout } from "@/lib/offline/conexion";
import type { ContrataCreada } from "@/components/contratas/contrata-creada";
import type { ContrataResumenCobro } from "@/lib/services/cobros";

/**
 * Entregar una contrata en modo local / sin señal.
 *
 * El servidor es quien crea la contrata, pero el cobrador la necesita YA:
 * verla en el perfil del cliente, cobrarle, y mandarle el comprobante por
 * WhatsApp en el momento de la entrega. Así que aquí se construye en el
 * teléfono lo mismo que construiría el servidor —con las mismas funciones
 * puras (`calcularFechasPago`, `cuotasVencidasOVigentes`)— y con el mismo
 * id que viajará en la petición, para que al sincronizar el servidor
 * confirme exactamente esta contrata en vez de crear otra.
 */

type InputContrata = {
  tipo: TipoContrata;
  monto: number;
  abono: number;
  fechaInicio: string;
  numCuotas: number;
  notas: string | null;
};

/** Filas a escribir en IndexedDB (las aplica el efecto de la cola). */
export type FilasEntregaLocal = {
  contrata: ContrataLocal;
  pagos: PagoLocal[];
  /** Cuotas que se marcan pagadas en otras contratas del cliente. */
  liquidar: { contrataId: string; abono: number; pagoIds: string[] }[];
};

export type EntregaLocal = {
  filas: FilasEntregaLocal;
  recibo: ContrataCreada;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function configLocal(ownerId: string): Promise<ConfigView> {
  return (await getConfiguracion(ownerId)) ?? CONFIG_DEFAULTS;
}

/** Abono sugerido y fechas sin ir al servidor (mismo cálculo que /api/contratas/preview). */
export async function previewLocal(
  ownerId: string,
  p: { tipo: TipoContrata; monto: number; fechaInicio: string; numCuotas: number }
): Promise<{ abonoSugerido: number; fechas: string[] }> {
  const config = await configLocal(ownerId);
  return {
    abonoSugerido: calcularAbono(
      p.monto,
      p.tipo,
      config.tasaSemanal,
      config.tasaQuincenal,
      p.numCuotas,
      config.tasaMensual,
      config.cuotasPorDefecto
    ),
    fechas: calcularFechasPago(
      p.tipo,
      config.modoFechasQuincenal,
      new Date(p.fechaInicio),
      p.numCuotas,
      config.diaCobroSemanal
    ).map((f) => f.toISOString()),
  };
}

export async function prepararEntregaLocal(
  ownerId: string,
  opts: {
    id: string;
    clienteId?: string;
    /** Cliente que se crea en el mismo lote (todavía no está en IndexedDB). */
    clienteNuevo?: { nombre: string };
    input: InputContrata;
    hoy: Date;
    /** Contratas que se liquidan completas (renovar: la original; unificar: las elegidas). */
    liquidarCompletas?: string[];
    /** "Incluir otras": cubre lo vencido/vigente de estas otras contratas. */
    cubrirVencidasDe?: string[];
  }
): Promise<EntregaLocal> {
  if (!db) throw new Error("Sin base de datos local");
  const config = await configLocal(ownerId);
  // Renovar/unificar no siempre tienen el clienteId a mano: se toma de la
  // contrata que se liquida.
  const clienteId =
    opts.clienteId ??
    (await db.contratas.get(opts.liquidarCompletas?.[0] ?? ""))?.clienteId;
  if (!clienteId) throw new Error("No se encontró el cliente en el teléfono");
  const cliente = await db.clientes.get(clienteId);
  const { input } = opts;

  const fechaInicio = new Date(input.fechaInicio);
  const fechas = calcularFechasPago(
    input.tipo,
    config.modoFechasQuincenal,
    fechaInicio,
    input.numCuotas,
    config.diaCobroSemanal
  );

  const contrata: ContrataLocal = {
    id: opts.id,
    ownerId,
    clienteId,
    clienteNombre: cliente?.nombre ?? opts.clienteNuevo?.nombre ?? "Cliente",
    clienteTelefono: cliente?.telefono ?? null,
    tipo: input.tipo,
    monto: input.monto,
    abono: input.abono,
    fechaInicio: fechaInicio.toISOString(),
    numCuotas: input.numCuotas,
    mes: format(fechaInicio, "LLLL yyyy", { locale: es }),
    notas: input.notas,
    convertidaADeuda: false,
    deudorId: null,
    creadoEn: opts.hoy.toISOString(),
    _dirty: true,
  };
  const pagos: PagoLocal[] = fechas.map((f, i) => ({
    id: crypto.randomUUID(),
    contrataId: opts.id,
    ownerId,
    numeroCuota: i + 1,
    fechaProgramada: f.toISOString(),
    fechaPago: null,
    pagado: false,
    montoAbonado: 0,
  }));

  const liquidar: FilasEntregaLocal["liquidar"] = [];
  const otrasLiquidadas: ContrataResumenCobro[] = [];

  for (const cid of opts.liquidarCompletas ?? []) {
    const c = await db.contratas.get(cid);
    if (!c) continue;
    const ps = await db.pagos.where("contrataId").equals(cid).toArray();
    liquidar.push({
      contrataId: cid,
      abono: c.abono,
      pagoIds: ps.filter((p) => !p.pagado).map((p) => p.id),
    });
  }

  for (const cid of opts.cubrirVencidasDe ?? []) {
    const c = await db.contratas.get(cid);
    if (!c) continue;
    const ps = await db.pagos.where("contrataId").equals(cid).toArray();
    const cuotas = cuotasVencidasOVigentes(
      ps.map((p) => ({ ...p, fechaProgramada: new Date(p.fechaProgramada) })),
      opts.hoy
    );
    if (cuotas.length === 0) continue;
    liquidar.push({ contrataId: cid, abono: c.abono, pagoIds: cuotas.map((p) => p.id) });
    const detalle = cuotas.map((p) => ({
      numeroCuota: p.numeroCuota,
      monto: round2(c.abono - p.montoAbonado),
    }));
    otrasLiquidadas.push({
      contrataId: cid,
      tipo: c.tipo,
      numCuotas: c.numCuotas,
      montoContrata: c.monto,
      cuotas: detalle,
      subtotal: round2(detalle.reduce((s, d) => s + d.monto, 0)),
    });
  }

  return {
    filas: { contrata, pagos, liquidar },
    recibo: {
      id: opts.id,
      cliente: { nombre: contrata.clienteNombre, telefono: contrata.clienteTelefono },
      tipo: input.tipo,
      monto: input.monto,
      abono: input.abono,
      numCuotas: input.numCuotas,
      pagos: pagos.map((p) => ({
        numeroCuota: p.numeroCuota,
        fechaProgramada: p.fechaProgramada,
      })),
      otrasLiquidadas,
    },
  };
}

/** Escribe las filas en IndexedDB. Lo llama el efecto optimista de la cola. */
export async function aplicarFilasEntrega(filas: FilasEntregaLocal): Promise<void> {
  if (!db) return;
  const ahora = new Date().toISOString();
  await db.contratas.put({ ...filas.contrata, _dirty: true });
  await db.pagos.bulkPut(filas.pagos);
  for (const l of filas.liquidar) {
    for (const id of l.pagoIds) {
      await db.pagos.update(id, { pagado: true, montoAbonado: l.abono, fechaPago: ahora });
    }
    await db.contratas.update(l.contrataId, { _dirty: true });
  }
}

/**
 * Vista previa (abono sugerido + calendario) para los formularios de
 * entrega. En modo local / sin señal se calcula en el teléfono; con señal se
 * pide al servidor y, si falla, también se calcula aquí — antes, sin red el
 * formulario se quedaba sin fechas ni abono sugerido.
 */
export async function obtenerPreview(
  ownerId: string | null | undefined,
  p: { tipo: TipoContrata; monto: number; fechaInicio: string; numCuotas: number }
): Promise<{ abonoSugerido: number; fechas: string[] } | null> {
  if (!debeTrabajarLocal()) {
    try {
      const res = await fetchConTimeout("/api/contratas/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (res.ok) return await res.json();
    } catch {
      // Se cae al cálculo local.
    }
  }
  return ownerId ? previewLocal(ownerId, p) : null;
}
