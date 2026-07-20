import type { TipoContrata } from "@prisma/client";
import { db, type ContrataLocal, type PagoLocal } from "@/lib/offline/db";
import {
  estadoContrata,
  saldoPendiente,
  montoVencidoOVigente,
  calcularScorePago,
  construirHistorial,
  type ResultadoScorePago,
  type EventoHistorial,
} from "@/lib/contrata";
import {
  aggregateKpis,
  aggregateTendencia,
  type FiltroDashboard,
  type Kpis,
  type MesTendencia,
} from "@/lib/services/dashboard";
import type { ContrataResumen } from "@/components/contratas/tipos";
import { aggregarRutaDelDia, type ParadaRuta } from "@/lib/services/ruta";

/**
 * Capa de lectura offline: espejo de src/lib/services/*.ts pero leyendo
 * IndexedDB en vez de Prisma. Todo query filtra explícitamente por
 * `ownerId` — nunca leer un store de dominio sin scope, es el único punto
 * de control de multi-tenancy en el cliente.
 */

async function pagosDeContrata(contrataId: string): Promise<PagoLocal[]> {
  if (!db) return [];
  const pagos = await db.pagos.where("contrataId").equals(contrataId).toArray();
  return pagos.sort((a, b) => a.numeroCuota - b.numeroCuota);
}

export async function getContratas(
  ownerId: string,
  tipo?: TipoContrata
): Promise<ContrataResumen[]> {
  if (!db) return [];
  let contratas = await db.contratas.where("ownerId").equals(ownerId).toArray();
  contratas = contratas.filter((c) => !c._deletedAt);
  if (tipo) contratas = contratas.filter((c) => c.tipo === tipo);

  const resumenes: ContrataResumen[] = [];
  for (const c of contratas) {
    const pagos = await pagosDeContrata(c.id);
    const pagosParaCalculo = pagos.map((p) => ({
      ...p,
      fechaProgramada: new Date(p.fechaProgramada),
    }));
    resumenes.push({
      id: c.id,
      clienteNombre: c.clienteNombre,
      tipo: c.tipo,
      monto: c.monto,
      abono: c.abono,
      pagados: pagos.filter((p) => p.pagado).length,
      total: pagos.length,
      saldo: c.convertidaADeuda ? 0 : saldoPendiente(pagosParaCalculo, c.abono),
      estado: c.convertidaADeuda ? "EN_DEUDA" : estadoContrata(pagosParaCalculo),
      creadoEn: c.creadoEn,
    });
  }
  resumenes.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  return resumenes;
}

export type ContrataDetalleLocal = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  fechaInicio: string;
  notas: string | null;
  convertidaADeuda: boolean;
  creadoEn: string;
  pagos: {
    numeroCuota: number;
    fechaProgramada: string;
    fechaPago: string | null;
    pagado: boolean;
    montoAbonado: number;
  }[];
};

/** `undefined` mientras useLiveQuery sigue resolviendo; `null` si se confirma que no existe. */
export async function getContrata(
  ownerId: string,
  id: string
): Promise<ContrataDetalleLocal | null> {
  if (!db) return null;
  const c = await db.contratas.get(id);
  if (!c || c.ownerId !== ownerId || c._deletedAt) return null;
  const pagos = await pagosDeContrata(id);
  return {
    id: c.id,
    clienteId: c.clienteId,
    clienteNombre: c.clienteNombre,
    clienteTelefono: c.clienteTelefono,
    tipo: c.tipo,
    monto: c.monto,
    abono: c.abono,
    numCuotas: c.numCuotas,
    fechaInicio: c.fechaInicio,
    notas: c.notas,
    convertidaADeuda: c.convertidaADeuda,
    creadoEn: c.creadoEn,
    pagos: pagos.map((p) => ({
      numeroCuota: p.numeroCuota,
      fechaProgramada: p.fechaProgramada,
      fechaPago: p.fechaPago,
      pagado: p.pagado,
      montoAbonado: p.montoAbonado,
    })),
  };
}

export type ContrataConSaldoLocal = {
  id: string;
  tipo: TipoContrata;
  saldo: number;
};

async function contratasDelClienteParaSaldo(
  ownerId: string,
  clienteId: string,
  excluirId?: string
) {
  if (!db) return [];
  const contratas = (
    await db.contratas.where("clienteId").equals(clienteId).toArray()
  ).filter(
    (c) =>
      !c._deletedAt &&
      c.ownerId === ownerId &&
      !c.convertidaADeuda &&
      c.id !== excluirId
  );
  return Promise.all(
    contratas.map(async (c) => ({
      contrata: c,
      pagos: await pagosDeContrata(c.id),
    }))
  );
}

/** Espejo offline de `contratasConSaldo` (usado por "unificar"): saldo total restante. */
export async function getContratasConSaldo(
  ownerId: string,
  clienteId: string,
  excluirId?: string
): Promise<ContrataConSaldoLocal[]> {
  const conPagos = await contratasDelClienteParaSaldo(ownerId, clienteId, excluirId);
  return conPagos
    .map(({ contrata, pagos }) => ({
      id: contrata.id,
      tipo: contrata.tipo,
      saldo: saldoPendiente(
        pagos.map((p) => ({ ...p, fechaProgramada: new Date(p.fechaProgramada) })),
        contrata.abono
      ),
    }))
    .filter((c) => c.saldo > 0);
}

/** Espejo offline de `contratasConVencido` (usado por "renovar"): solo lo vencido/vigente. */
export async function getContratasConVencido(
  ownerId: string,
  clienteId: string,
  excluirId?: string,
  hoy: Date = new Date()
): Promise<ContrataConSaldoLocal[]> {
  const conPagos = await contratasDelClienteParaSaldo(ownerId, clienteId, excluirId);
  return conPagos
    .map(({ contrata, pagos }) => ({
      id: contrata.id,
      tipo: contrata.tipo,
      saldo: montoVencidoOVigente(
        pagos.map((p) => ({
          ...p,
          fechaProgramada: new Date(p.fechaProgramada),
        })),
        contrata.abono,
        hoy
      ),
    }))
    .filter((c) => c.saldo > 0);
}

export async function getKpis(
  ownerId: string,
  filtro: FiltroDashboard = "TODAS",
  hoy: Date = new Date()
): Promise<Kpis> {
  if (!db) {
    return aggregateKpis([], [], hoy);
  }
  const todas = (await db.contratas.where("ownerId").equals(ownerId).toArray()).filter(
    (c) => !c._deletedAt
  );
  const activasFiltradas = todas.filter(
    (c) => !c.convertidaADeuda && (filtro === "TODAS" || c.tipo === filtro)
  );

  const conPagos = await Promise.all(
    activasFiltradas.map(async (c) => ({
      tipo: c.tipo,
      monto: c.monto,
      abono: c.abono,
      numCuotas: c.numCuotas,
      fechaInicio: new Date(c.fechaInicio),
      pagos: (await pagosDeContrata(c.id)).map((p) => ({
        pagado: p.pagado,
        montoAbonado: p.montoAbonado,
        fechaProgramada: new Date(p.fechaProgramada),
        fechaPago: p.fechaPago ? new Date(p.fechaPago) : null,
      })),
    }))
  );

  const todasParaMonto = todas.map((c) => ({
    tipo: c.tipo,
    monto: c.monto,
    fechaInicio: new Date(c.fechaInicio),
  }));

  return aggregateKpis(conPagos, todasParaMonto, hoy);
}

/** Espejo offline de `computeTendencia`: mismos datos, leídos de IndexedDB. */
export async function getTendencia(
  ownerId: string,
  meses: number = 6,
  hoy: Date = new Date()
): Promise<MesTendencia[]> {
  if (!db) return aggregateTendencia([], meses, hoy);
  const todas = (
    await db.contratas.where("ownerId").equals(ownerId).toArray()
  ).filter((c) => !c._deletedAt);

  const conPagos = await Promise.all(
    todas.map(async (c) => ({
      monto: c.monto,
      fechaInicio: new Date(c.fechaInicio),
      pagos: (await pagosDeContrata(c.id)).map((p) => ({
        montoAbonado: p.montoAbonado,
        pagado: p.pagado,
        fechaPago: p.fechaPago ? new Date(p.fechaPago) : null,
      })),
    }))
  );

  return aggregateTendencia(conPagos, meses, hoy);
}

export function contrataLocalFromRow(c: ContrataLocal) {
  return c;
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export async function getClientes(ownerId: string) {
  if (!db) return [];
  const clientes = (
    await db.clientes.where("ownerId").equals(ownerId).toArray()
  ).filter((c) => !c._deletedAt);
  const contratas = await db.contratas.where("ownerId").equals(ownerId).toArray();
  const conteo = new Map<string, number>();
  for (const c of contratas) {
    if (c._deletedAt) continue;
    conteo.set(c.clienteId, (conteo.get(c.clienteId) ?? 0) + 1);
  }
  return clientes
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      numContratas: conteo.get(c.id) ?? 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export type ClientePerfilLocal = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
  notas: string | null;
  contratas: {
    id: string;
    tipo: TipoContrata;
    monto: number;
    abono: number;
    pagados: number;
    total: number;
    saldo: number;
    estado: ReturnType<typeof estadoContrata> | "EN_DEUDA";
  }[];
  totales: {
    capitalPrestado: number;
    contratasActivas: number;
    contratasLiquidadas: number;
    saldoPendiente: number;
  };
  scorePago: ResultadoScorePago;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** `undefined` = cargando; `null` = confirmado ausente. */
export async function getClientePerfil(
  ownerId: string,
  clienteId: string
): Promise<ClientePerfilLocal | null> {
  if (!db) return null;
  const cliente = await db.clientes.get(clienteId);
  if (!cliente || cliente.ownerId !== ownerId || cliente._deletedAt) return null;

  const contratasRaw = (
    await db.contratas.where("clienteId").equals(clienteId).toArray()
  ).filter((c) => !c._deletedAt);

  const todosLosPagos: {
    pagado: boolean;
    fechaProgramada: Date;
    fechaPago: Date | null;
  }[] = [];

  const contratas = await Promise.all(
    contratasRaw.map(async (c) => {
      const pagos = await pagosDeContrata(c.id);
      const pagosParaCalculo = pagos.map((p) => ({
        ...p,
        fechaProgramada: new Date(p.fechaProgramada),
        fechaPago: p.fechaPago ? new Date(p.fechaPago) : null,
      }));
      todosLosPagos.push(...pagosParaCalculo);
      return {
        id: c.id,
        tipo: c.tipo,
        monto: c.monto,
        abono: c.abono,
        pagados: pagos.filter((p) => p.pagado).length,
        total: pagos.length,
        saldo: c.convertidaADeuda ? 0 : saldoPendiente(pagosParaCalculo, c.abono),
        estado: c.convertidaADeuda
          ? ("EN_DEUDA" as const)
          : estadoContrata(pagosParaCalculo),
      };
    })
  );
  contratas.sort((a, b) => b.id.localeCompare(a.id));

  const scorePago = calcularScorePago(todosLosPagos);

  const paraTotales = contratas.filter((c) => c.estado !== "EN_DEUDA");
  const totales = {
    capitalPrestado: round2(contratas.reduce((s, c) => s + c.monto, 0)),
    contratasActivas: paraTotales.filter((c) => c.estado !== "LIQUIDADA").length,
    contratasLiquidadas: paraTotales.filter((c) => c.estado === "LIQUIDADA")
      .length,
    saldoPendiente: round2(paraTotales.reduce((s, c) => s + c.saldo, 0)),
  };

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    direccion: cliente.direccion,
    referencia: cliente.referencia,
    notas: cliente.notas,
    contratas,
    totales,
    scorePago,
  };
}

export type EstadoCuentaClienteLocal = {
  id: string;
  nombre: string;
  telefono: string | null;
  contratas: {
    id: string;
    tipo: TipoContrata;
    monto: number;
    abono: number;
    numCuotas: number;
    pagados: number;
    total: number;
    saldo: number;
    estado: ReturnType<typeof estadoContrata> | "EN_DEUDA";
    totalAbonado: number;
    pagos: {
      numeroCuota: number;
      fechaProgramada: string;
      fechaPago: string | null;
      pagado: boolean;
      montoAbonado: number;
    }[];
  }[];
  totales: {
    capitalPrestado: number;
    totalAbonado: number;
    saldoPendiente: number;
  };
};

/** Espejo offline de `getEstadoCuentaCliente`: mismos datos, leídos de IndexedDB. */
export async function getEstadoCuentaCliente(
  ownerId: string,
  clienteId: string
): Promise<EstadoCuentaClienteLocal | null> {
  if (!db) return null;
  const cliente = await db.clientes.get(clienteId);
  if (!cliente || cliente.ownerId !== ownerId || cliente._deletedAt) return null;

  const contratasRaw = (
    await db.contratas.where("clienteId").equals(clienteId).toArray()
  ).filter((c) => !c._deletedAt);

  const contratas = await Promise.all(
    contratasRaw.map(async (c) => {
      const pagos = await pagosDeContrata(c.id);
      const pagosParaCalculo = pagos.map((p) => ({
        ...p,
        fechaProgramada: new Date(p.fechaProgramada),
        fechaPago: p.fechaPago ? new Date(p.fechaPago) : null,
      }));
      return {
        id: c.id,
        tipo: c.tipo,
        monto: c.monto,
        abono: c.abono,
        numCuotas: c.numCuotas,
        pagados: pagos.filter((p) => p.pagado).length,
        total: pagos.length,
        saldo: c.convertidaADeuda ? 0 : saldoPendiente(pagosParaCalculo, c.abono),
        estado: c.convertidaADeuda
          ? ("EN_DEUDA" as const)
          : estadoContrata(pagosParaCalculo),
        totalAbonado: round2(pagos.reduce((s, p) => s + p.montoAbonado, 0)),
        pagos,
      };
    })
  );
  contratas.sort((a, b) => b.id.localeCompare(a.id));

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    contratas,
    totales: {
      capitalPrestado: round2(contratas.reduce((s, c) => s + c.monto, 0)),
      totalAbonado: round2(contratas.reduce((s, c) => s + c.totalAbonado, 0)),
      saldoPendiente: round2(contratas.reduce((s, c) => s + c.saldo, 0)),
    },
  };
}

/** Espejo offline de `getHistorialCliente`: mismos datos, leídos de IndexedDB. */
export async function getHistorialCliente(
  ownerId: string,
  clienteId: string
): Promise<{ id: string; nombre: string; eventos: EventoHistorial[] } | null> {
  if (!db) return null;
  const cliente = await db.clientes.get(clienteId);
  if (!cliente || cliente.ownerId !== ownerId || cliente._deletedAt) return null;

  const contratasRaw = (
    await db.contratas.where("clienteId").equals(clienteId).toArray()
  ).filter((c) => !c._deletedAt);

  const contratas = await Promise.all(
    contratasRaw.map(async (c) => ({
      id: c.id,
      tipo: c.tipo,
      monto: c.monto,
      fechaInicio: new Date(c.fechaInicio),
      pagos: (await pagosDeContrata(c.id)).map((p) => ({
        numeroCuota: p.numeroCuota,
        fechaPago: p.fechaPago ? new Date(p.fechaPago) : null,
        pagado: p.pagado,
        montoAbonado: p.montoAbonado,
      })),
    }))
  );

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    eventos: construirHistorial(contratas),
  };
}

// ---------------------------------------------------------------------------
// Deudores
// ---------------------------------------------------------------------------

export async function getDeudores(ownerId: string) {
  if (!db) return { deudores: [], deudaViva: 0 };
  const deudores = (
    await db.deudores.where("ownerId").equals(ownerId).toArray()
  ).filter((d) => !d._deletedAt);
  const resumenes = deudores
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      saldoActual: d.saldoActual,
      numAbonos: d.numAbonos,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const deudaViva = round2(deudores.reduce((s, d) => s + d.saldoActual, 0));
  return { deudores: resumenes, deudaViva };
}

export type DeudorDetalleLocal = {
  id: string;
  nombre: string;
  deudaInicial: number;
  notas: string | null;
  saldoActual: number;
  abonos: {
    id: string;
    fecha: string;
    monto: number;
    restante: number;
    notas: string | null;
  }[];
};

export async function getDeudor(
  ownerId: string,
  id: string
): Promise<DeudorDetalleLocal | null> {
  if (!db) return null;
  const d = await db.deudores.get(id);
  if (!d || d.ownerId !== ownerId || d._deletedAt) return null;
  const abonos = (
    await db.abonosDeudor.where("deudorId").equals(id).toArray()
  ).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    id: d.id,
    nombre: d.nombre,
    deudaInicial: d.deudaInicial,
    notas: d.notas,
    saldoActual: d.saldoActual,
    abonos,
  };
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/** Espejo local (sin desglose por cuota) de previewCobroVencidas — usado
 * como respaldo cuando no hay red para pedir el preview real al servidor. */
export async function getCobroVencidoPreview(
  ownerId: string,
  clienteId: string
): Promise<{ total: number; items: number }> {
  if (!db) return { total: 0, items: 0 };
  const contratas = (
    await db.contratas.where("clienteId").equals(clienteId).toArray()
  ).filter((c) => !c._deletedAt && !c.convertidaADeuda && c.ownerId === ownerId);
  let total = 0;
  let items = 0;
  for (const c of contratas) {
    const pagos = (await pagosDeContrata(c.id)).filter((p) => !p.pagado);
    for (const p of pagos) {
      if (new Date(p.fechaProgramada) > new Date()) continue;
      const pendiente = Math.round((c.abono - p.montoAbonado) * 100) / 100;
      if (pendiente <= 0) continue;
      total = Math.round((total + pendiente) * 100) / 100;
      items += 1;
    }
  }
  return { total, items };
}

export async function getConfiguracion(
  ownerId: string
): Promise<import("@/lib/config").ConfigView | null> {
  if (!db) return null;
  const cfg = await db.configuracion.get(ownerId);
  if (!cfg) return null;
  return {
    ...cfg,
    modoFechasQuincenal: cfg.modoFechasQuincenal as import("@prisma/client").ModoQuincenal,
  };
}

/** Espejo offline de `computeRutaDelDia`: mismos datos, leídos de IndexedDB. */
export async function getRutaDelDia(
  ownerId: string,
  hoy: Date = new Date()
): Promise<ParadaRuta[]> {
  if (!db) return aggregarRutaDelDia([], hoy);
  const clientes = (
    await db.clientes.where("ownerId").equals(ownerId).toArray()
  ).filter((c) => !c._deletedAt);

  const conContratas = await Promise.all(
    clientes.map(async (cliente) => {
      const contratasRaw = (
        await db!.contratas.where("clienteId").equals(cliente.id).toArray()
      ).filter((c) => !c._deletedAt);
      const contratas = await Promise.all(
        contratasRaw.map(async (c) => ({
          id: c.id,
          abono: c.abono,
          convertidaADeuda: c.convertidaADeuda,
          pagos: (await pagosDeContrata(c.id)).map((p) => ({
            numeroCuota: p.numeroCuota,
            fechaProgramada: new Date(p.fechaProgramada),
            pagado: p.pagado,
            montoAbonado: p.montoAbonado,
          })),
        }))
      );
      return {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        direccion: cliente.direccion,
        contratas,
      };
    })
  );

  return aggregarRutaDelDia(conContratas, hoy);
}
