import type { TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import {
  estadoContrata,
  saldoPendiente,
  calcularScorePago,
  type EstadoContrata,
  type ResultadoScorePago,
} from "@/lib/contrata";
import { normalizarTexto, soloDigitos } from "@/lib/texto";

/**
 * Búsqueda de clientes que cruza el espacio de trabajo de OTROS
 * administradores — la única consulta de la app que se hace a propósito sin
 * filtrar por `ownerId` propio (ver la nota de aislamiento en
 * `src/lib/session.ts`). Existe para que un contratista pueda ver, antes de
 * prestarle a alguien nuevo, si ese cliente ya tiene contratas activas o
 * atrasadas con otro contratista — y decidir con esa información. Es de
 * solo lectura: nunca permite editar ni ver las notas privadas del otro
 * administrador sobre ese cliente.
 */

const LARGO_MINIMO_BUSQUEDA = 2;
const LARGO_MINIMO_TELEFONO = 4;
const LIMITE_RESULTADOS = 20;

export type ClienteGlobalResumen = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  scorePago: ResultadoScorePago;
};

/**
 * Trae SOLO los campos mínimos (nada de contratas ni montos) y filtra en
 * memoria: la comparación debe ser insensible a acentos, y esta base no
 * tiene la extensión `unaccent` de Postgres habilitada. Para el volumen de
 * clientes de un negocio de este tipo, un escaneo completo es barato — si
 * la base creciera a mucho mayor escala, esto necesitaría un índice
 * dedicado (columna normalizada + trigram) en vez de filtrar en JS.
 */
export async function buscarClientesGlobal(
  query: string,
  ownerIdActual: string
): Promise<ClienteGlobalResumen[]> {
  const qNombre = normalizarTexto(query);
  const qDigitos = soloDigitos(query);
  if (qNombre.length < LARGO_MINIMO_BUSQUEDA && qDigitos.length < LARGO_MINIMO_TELEFONO) {
    return [];
  }

  const candidatos = await prisma.cliente.findMany({
    where: { ownerId: { not: ownerIdActual } },
    select: { id: true, nombre: true, telefono: true, direccion: true },
  });

  const encontrados = candidatos
    .filter((c) => {
      if (qNombre.length >= LARGO_MINIMO_BUSQUEDA && normalizarTexto(c.nombre).includes(qNombre)) {
        return true;
      }
      if (qDigitos.length >= LARGO_MINIMO_TELEFONO && c.telefono) {
        return soloDigitos(c.telefono).includes(qDigitos);
      }
      return false;
    })
    .slice(0, LIMITE_RESULTADOS);

  if (encontrados.length === 0) return [];

  // Segunda consulta, acotada a los pocos resultados que sí se van a
  // mostrar: la puntualidad ayuda a decidir entre varias coincidencias
  // antes de entrar al detalle de cada una.
  const conPagos = await prisma.cliente.findMany({
    where: { id: { in: encontrados.map((c) => c.id) } },
    select: { id: true, contratas: { select: { pagos: true } } },
  });
  const pagosPorCliente = new Map(
    conPagos.map((c) => [c.id, calcularScorePago(c.contratas.flatMap((k) => k.pagos))])
  );

  return encontrados.map((c) => ({
    ...c,
    scorePago: pagosPorCliente.get(c.id) ?? calcularScorePago([]),
  }));
}

export type ContrataGlobalResumen = {
  id: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  pagados: number;
  total: number;
  saldo: number;
  estado: EstadoContrata;
};

export type ClienteGlobalDetalle = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  /** Nombre del administrador dueño de este cliente — para saber con quién hablar. */
  ownerNombre: string;
  contratas: ContrataGlobalResumen[];
  totales: {
    capitalPrestado: number;
    contratasActivas: number;
    saldoPendiente: number;
  };
  scorePago: ResultadoScorePago;
};

/**
 * Perfil de solo lectura de un cliente de otro administrador. A propósito
 * NO incluye `referencia` ni `notas`: son anotaciones privadas del otro
 * negocio (p. ej. "cliente conflictivo"), no datos de comportamiento de
 * pago — lo único que este feature necesita mostrar.
 */
export async function getClienteGlobalDetalle(id: string): Promise<ClienteGlobalDetalle> {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      contratas: { include: { pagos: true }, orderBy: { creadoEn: "desc" } },
      owner: { select: { nombre: true, email: true } },
    },
  });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");

  const contratas: ContrataGlobalResumen[] = cliente.contratas.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    monto: c.monto,
    abono: c.abono,
    pagados: c.pagos.filter((p) => p.pagado).length,
    total: c.pagos.length,
    saldo: c.convertidaADeuda ? 0 : saldoPendiente(c.pagos, c.abono),
    estado: c.convertidaADeuda ? "EN_DEUDA" : estadoContrata(c.pagos),
  }));

  // Mismo criterio que el perfil normal: lo convertido a deuda no cuenta
  // como "activo" ni suma al saldo pendiente de aquí.
  const paraTotales = contratas.filter((c) => c.estado !== "EN_DEUDA");
  const totales = {
    capitalPrestado: Math.round(contratas.reduce((s, c) => s + c.monto, 0) * 100) / 100,
    contratasActivas: paraTotales.filter((c) => c.estado !== "LIQUIDADA").length,
    saldoPendiente: Math.round(paraTotales.reduce((s, c) => s + c.saldo, 0) * 100) / 100,
  };

  const scorePago = calcularScorePago(cliente.contratas.flatMap((c) => c.pagos));

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    direccion: cliente.direccion,
    ownerNombre: cliente.owner.nombre ?? cliente.owner.email,
    contratas,
    totales,
    scorePago,
  };
}

/**
 * Copia un cliente ajeno a la cartera del administrador que lo encontró —
 * un registro limpio (sin historial, sin contratas) para poder prestarle
 * de cero. Solo copia los datos de contacto, nunca el comportamiento de
 * pago ni las notas del otro negocio.
 */
export async function duplicarClienteGlobal(id: string, ownerIdDestino: string) {
  const origen = await prisma.cliente.findUnique({
    where: { id },
    select: { nombre: true, telefono: true, direccion: true },
  });
  if (!origen) throw new HttpError(404, "Cliente no encontrado");

  return prisma.cliente.create({
    data: {
      ownerId: ownerIdDestino,
      nombre: origen.nombre,
      telefono: origen.telefono,
      direccion: origen.direccion,
    },
  });
}

/* ── Verificación de duplicados al registrar un cliente ─────────────────── */

/** Los últimos 10 dígitos: "+52 313 191 1315" y "3131911315" son el mismo. */
export function telefonoClave(telefono: string | null | undefined): string | null {
  const d = soloDigitos(telefono ?? "");
  return d.length >= 10 ? d.slice(-10) : null;
}

export type ClientePropioCoincidente = { id: string; nombre: string; telefono: string | null };
export type ClienteDeOtro = {
  administrador: string;
  nombre: string;
  /** El nombre capturado también coincide (no solo el teléfono). */
  mismoNombre: boolean;
  contratasActivas: number;
  saldo: number;
};

export type ResultadoVerificacion = {
  /** Nombre y teléfono iguales (o solo nombre si no se dio teléfono): es el mismo cliente. */
  propio: ClientePropioCoincidente | null;
  /** Mismo teléfono pero OTRO nombre en el espacio propio (p. ej. un familiar). */
  telefonoPropio: ClientePropioCoincidente | null;
  /** Clientes de otros administradores con ese teléfono. */
  otros: ClienteDeOtro[];
};

/**
 * Antes de dar de alta un cliente: ¿ya existe? Es el mismo cliente si
 * coinciden NOMBRE y TELÉFONO (sin acentos/mayúsculas; teléfono por sus
 * últimos 10 dígitos). Si solo coincide el teléfono se avisa a quién le
 * pertenece ese número — en campo es normal que familiares lo compartan —
 * y se deja registrar. Sin teléfono capturado, se compara solo el nombre
 * dentro del espacio propio.
 */
export async function verificarClienteNuevo(
  ownerId: string,
  datos: { nombre: string; telefono?: string | null }
): Promise<ResultadoVerificacion> {
  const tel = telefonoClave(datos.telefono);
  const nombre = normalizarTexto(datos.nombre);

  const propios = await prisma.cliente.findMany({
    where: { ownerId },
    select: { id: true, nombre: true, telefono: true },
  });
  const mismoNombre = (c: { nombre: string }) => !!nombre && normalizarTexto(c.nombre) === nombre;
  const mismoTel = (c: { telefono: string | null }) => !!tel && telefonoClave(c.telefono) === tel;

  const propio = tel
    ? propios.find((c) => mismoTel(c) && mismoNombre(c)) ?? null
    : propios.find(mismoNombre) ?? null;
  const telefonoPropio = !propio && tel ? propios.find(mismoTel) ?? null : null;

  if (!tel || propio) return { propio, telefonoPropio, otros: [] };

  const ajenos = (
    await prisma.cliente.findMany({
      where: { ownerId: { not: ownerId }, telefono: { not: null } },
      select: { id: true, nombre: true, telefono: true, ownerId: true },
    })
  ).filter(mismoTel);
  if (ajenos.length === 0) return { propio, telefonoPropio, otros: [] };

  const [duenos, contratas] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: Array.from(new Set(ajenos.map((c) => c.ownerId))) } },
      select: { id: true, nombre: true, email: true },
    }),
    prisma.contrata.findMany({
      where: { clienteId: { in: ajenos.map((c) => c.id) }, convertidaADeuda: false },
      select: { clienteId: true, abono: true, pagos: { select: { pagado: true, montoAbonado: true } } },
    }),
  ]);
  const nombreDueno = new Map(duenos.map((u) => [u.id, u.nombre ?? u.email]));
  const otros = ajenos
    .map((c) => {
      const activas = contratas.filter((k) => k.clienteId === c.id && k.pagos.some((p) => !p.pagado));
      const saldo = activas.reduce(
        (s, k) => s + k.pagos.filter((p) => !p.pagado).reduce((t, p) => t + Math.max(k.abono - p.montoAbonado, 0), 0),
        0
      );
      return {
        administrador: nombreDueno.get(c.ownerId) ?? "Otro administrador",
        nombre: c.nombre,
        mismoNombre: mismoNombre(c),
        contratasActivas: activas.length,
        saldo: Math.round(saldo * 100) / 100,
      };
    })
    // Primero las que también coinciden en nombre: son el mismo cliente.
    .sort((a, b) => Number(b.mismoNombre) - Number(a.mismoNombre));
  return { propio, telefonoPropio, otros };
}
