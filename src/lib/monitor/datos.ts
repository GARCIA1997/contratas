import { prisma } from "@/lib/prisma";
import { HttpError, requireUser } from "@/lib/session";

/**
 * Datos del monitor de operaciones (/monitor).
 *
 * A diferencia del resto de la app, aquí NO se scopea por espacio de
 * trabajo: el monitor ve a todos los usuarios a propósito — es la consola
 * interna del dueño de la plataforma. Por eso el acceso no depende del rol
 * (un ADMIN de un espacio no debe ver los demás) sino de una lista explícita
 * de correos en `MONITOR_EMAILS`.
 */

export async function requireMonitor() {
  const user = await requireUser().catch(() => {
    throw new HttpError(404, "No encontrado");
  });
  // Se lee de la BD en cada petición (no del token de sesión): quitar el
  // acceso surte efecto de inmediato, sin esperar a que expire la sesión.
  const fila = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accesoMonitor: true },
  });
  // 404 y no 403: quien no tiene acceso no debe saber que el monitor existe.
  if (!fila?.accesoMonitor) throw new HttpError(404, "No encontrado");
  return user;
}

/** Igual que requireMonitor pero sin lanzar — para las páginas (redirigen). */
export async function tieneAccesoMonitor(): Promise<boolean> {
  try {
    await requireMonitor();
    return true;
  } catch {
    return false;
  }
}

export type Rango = "hoy" | "7d" | "30d";

export function desdeDe(rango: Rango, ahora = new Date()): Date {
  const d = new Date(ahora);
  if (rango === "hoy") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setDate(d.getDate() - (rango === "7d" ? 7 : 30));
  return d;
}

/** Periodo anterior del mismo largo, para el % de cambio de los KPIs. */
function periodoAnterior(desde: Date, ahora: Date): Date {
  return new Date(desde.getTime() - (ahora.getTime() - desde.getTime()));
}

function cambio(actual: number, previo: number): number | null {
  if (previo === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - previo) / previo) * 100);
}

/** "contratas/abc123/pagos/2/abonar" → "contratas/:id/pagos/:n/abonar" */
export function tipoDeOperacion(endpoint: string): string {
  return endpoint
    .split("/")
    .map((s) => (/^\d+$/.test(s) ? ":n" : /^[a-z0-9-]{20,}$/i.test(s) ? ":id" : s))
    .join("/");
}

const ETIQUETA_OPERACION: Record<string, string> = {
  "contratas/crear": "Contrata entregada",
  "contratas/:id/renovar": "Renovación",
  "clientes/:id/unificar": "Unificación",
  "contratas/:id/pagos/:n/abonar": "Abono a cuota",
  "contratas/:id/pagos/:n/toggle": "Cuota cobrada",
  "clientes/:id/abonar": "Abono parcial",
  "clientes/:id/cobrar-vencidas": "Cobro de vencidas",
  "deudores/:id/abonos": "Abono de deudor",
  "citas/crear": "Cita agendada",
  "citas/:id/entregar": "Cita entregada",
  "contratas/:id/marcar-deuda": "Pasó a deuda",
};

export function etiquetaOperacion(endpoint: string): string {
  return ETIQUETA_OPERACION[tipoDeOperacion(endpoint)] ?? tipoDeOperacion(endpoint);
}

/* ── Resumen ──────────────────────────────────────────────────────────── */

export async function getResumen(rango: Rango) {
  const ahora = new Date();
  const desde = desdeDe(rango, ahora);
  const antes = periodoAnterior(desde, ahora);

  const [
    ops,
    opsPrevias,
    errores,
    erroresPrevios,
    activos,
    activosPrevios,
    cobrado,
    cobradoPrevio,
    entregadas,
    entregadasPrevias,
    cartera,
    logins,
  ] = await Promise.all([
    prisma.processedOperation.count({ where: { creadoEn: { gte: desde } } }),
    prisma.processedOperation.count({ where: { creadoEn: { gte: antes, lt: desde } } }),
    prisma.errorLog.count({ where: { creadoEn: { gte: desde } } }),
    prisma.errorLog.count({ where: { creadoEn: { gte: antes, lt: desde } } }),
    espaciosActivos(desde, ahora),
    espaciosActivos(antes, desde),
    prisma.pago.aggregate({
      _sum: { montoAbonado: true },
      where: { fechaPago: { gte: desde } },
    }),
    prisma.pago.aggregate({
      _sum: { montoAbonado: true },
      where: { fechaPago: { gte: antes, lt: desde } },
    }),
    prisma.contrata.count({ where: { creadoEn: { gte: desde } } }),
    prisma.contrata.count({ where: { creadoEn: { gte: antes, lt: desde } } }),
    carteraActiva(),
    prisma.loginAttempt.groupBy({
      by: ["exitoso"],
      _count: true,
      where: { creadoEn: { gte: desde } },
    }),
  ]);

  const cobradoN = cobrado._sum.montoAbonado ?? 0;
  const cobradoP = cobradoPrevio._sum.montoAbonado ?? 0;

  return {
    rango,
    generadoEn: ahora.toISOString(),
    kpis: {
      usuariosActivos: { valor: activos, cambio: cambio(activos, activosPrevios) },
      errores: { valor: errores, cambio: cambio(errores, erroresPrevios) },
      movimientos: { valor: ops, cambio: cambio(ops, opsPrevias) },
      cobrado: { valor: Math.round(cobradoN * 100) / 100, cambio: cambio(cobradoN, cobradoP) },
      entregadas: { valor: entregadas, cambio: cambio(entregadas, entregadasPrevias) },
      cartera: { valor: cartera, cambio: null },
    },
    serie: await serieActividad(desde, ahora, rango === "hoy" ? "hora" : "dia"),
    erroresRecientes: await getErroresAgrupados({ desde, limite: 6 }),
    espacios: (await getEspacios(desde)).slice(0, 6),
    logins: {
      exitosos: logins.find((l) => l.exitoso)?._count ?? 0,
      fallidos: logins.find((l) => !l.exitoso)?._count ?? 0,
    },
    salud: await getSalud(),
  };
}

async function espaciosActivos(desde: Date, hasta: Date): Promise<number> {
  const filas = await prisma.processedOperation.findMany({
    where: { creadoEn: { gte: desde, lt: hasta } },
    distinct: ["ownerId"],
    select: { ownerId: true },
  });
  return filas.length;
}

/** Saldo vivo de todas las contratas activas (abono × cuotas − abonado). */
async function carteraActiva(): Promise<number> {
  const [fila] = await prisma.$queryRaw<{ saldo: number | null }[]>`
    SELECT SUM(c."abono" * c."numCuotas" - COALESCE(p.abonado, 0))::float AS saldo
    FROM "Contrata" c
    LEFT JOIN (
      SELECT "contrataId", SUM("montoAbonado") AS abonado
      FROM "Pago" GROUP BY "contrataId"
    ) p ON p."contrataId" = c."id"
    WHERE c."convertidaADeuda" = false
  `;
  return Math.round((fila?.saldo ?? 0) * 100) / 100;
}

async function serieActividad(desde: Date, hasta: Date, paso: "hora" | "dia") {
  const unidad = paso === "hora" ? "hour" : "day";
  const [ops, errs] = await Promise.all([
    prisma.$queryRawUnsafe<{ t: Date; n: bigint }[]>(
      `SELECT date_trunc('${unidad}', "creadoEn") AS t, COUNT(*) AS n
       FROM "ProcessedOperation" WHERE "creadoEn" >= $1 AND "creadoEn" < $2
       GROUP BY 1 ORDER BY 1`,
      desde,
      hasta
    ),
    prisma.$queryRawUnsafe<{ t: Date; n: bigint }[]>(
      `SELECT date_trunc('${unidad}', "creadoEn") AS t, COUNT(*) AS n
       FROM "ErrorLog" WHERE "creadoEn" >= $1 AND "creadoEn" < $2
       GROUP BY 1 ORDER BY 1`,
      desde,
      hasta
    ),
  ]);
  const puntos = new Map<string, { t: string; movimientos: number; errores: number }>();
  const paso_ms = paso === "hora" ? 3600_000 : 86_400_000;
  const inicio = new Date(desde);
  if (paso === "hora") inicio.setMinutes(0, 0, 0);
  else inicio.setHours(0, 0, 0, 0);
  for (let t = inicio.getTime(); t <= hasta.getTime(); t += paso_ms) {
    const k = new Date(t).toISOString();
    puntos.set(k, { t: k, movimientos: 0, errores: 0 });
  }
  const clave = (d: Date) => {
    const x = new Date(d);
    if (paso === "hora") x.setMinutes(0, 0, 0);
    else x.setHours(0, 0, 0, 0);
    return x.toISOString();
  };
  for (const r of ops) {
    const p = puntos.get(clave(r.t));
    if (p) p.movimientos = Number(r.n);
  }
  for (const r of errs) {
    const p = puntos.get(clave(r.t));
    if (p) p.errores = Number(r.n);
  }
  return Array.from(puntos.values());
}

/* ── Errores ──────────────────────────────────────────────────────────── */

export async function getErroresAgrupados(opts: {
  desde: Date;
  limite?: number;
  origen?: string;
  q?: string;
}) {
  const errores = await prisma.errorLog.findMany({
    where: {
      creadoEn: { gte: opts.desde },
      ...(opts.origen ? { origen: opts.origen } : {}),
      ...(opts.q ? { mensaje: { contains: opts.q, mode: "insensitive" } } : {}),
    },
    orderBy: { creadoEn: "desc" },
    take: 2000,
  });
  const nombres = await nombresDe(errores.map((e) => e.actorId ?? e.ownerId));
  const grupos = new Map<
    string,
    {
      id: string;
      mensaje: string;
      origen: string;
      veces: number;
      ultimo: string;
      usuarios: Set<string>;
      url: string | null;
    }
  >();
  for (const e of errores) {
    const k = `${e.origen}|${e.mensaje.slice(0, 160)}`;
    const g = grupos.get(k);
    const quien = nombres.get(e.actorId ?? e.ownerId ?? "") ?? "Anónimo";
    if (g) {
      g.veces++;
      g.usuarios.add(quien);
    } else {
      grupos.set(k, {
        id: e.id,
        mensaje: e.mensaje,
        origen: e.origen,
        veces: 1,
        ultimo: e.creadoEn.toISOString(),
        usuarios: new Set([quien]),
        url: e.url,
      });
    }
  }
  return Array.from(grupos.values())
    .slice(0, opts.limite ?? 200)
    .map((g) => ({ ...g, usuarios: Array.from(g.usuarios) }));
}

export async function getError(id: string) {
  const e = await prisma.errorLog.findUnique({ where: { id } });
  if (!e) throw new HttpError(404, "Error no encontrado");
  const [similares, nombres] = await Promise.all([
    prisma.errorLog.findMany({
      where: { origen: e.origen, mensaje: e.mensaje },
      orderBy: { creadoEn: "desc" },
      take: 50,
      select: { id: true, creadoEn: true, actorId: true, ownerId: true, url: true, userAgent: true },
    }),
    nombresDe([e.actorId, e.ownerId]),
  ]);
  const nombresSimilares = await nombresDe(similares.map((s) => s.actorId ?? s.ownerId));
  return {
    ...e,
    creadoEn: e.creadoEn.toISOString(),
    usuario: nombres.get(e.actorId ?? e.ownerId ?? "") ?? "Anónimo",
    ocurrencias: similares.map((s) => ({
      ...s,
      creadoEn: s.creadoEn.toISOString(),
      usuario: nombresSimilares.get(s.actorId ?? s.ownerId ?? "") ?? "Anónimo",
    })),
  };
}

/* ── Actividad (bitácora) ─────────────────────────────────────────────── */

export type EventoActividad = {
  id: string;
  creadoEn: string;
  tipo: "movimiento" | "auditoria" | "login" | "error";
  titulo: string;
  detalle: string | null;
  usuario: string;
  ok: boolean;
};

export async function getActividad(opts: { desde: Date; tipo?: string; q?: string; limite?: number }) {
  const limite = opts.limite ?? 300;
  const quiere = (t: string) => !opts.tipo || opts.tipo === t;
  const [ops, audit, logins, errores] = await Promise.all([
    quiere("movimiento")
      ? prisma.processedOperation.findMany({
          where: { creadoEn: { gte: opts.desde } },
          orderBy: { creadoEn: "desc" },
          take: limite,
          select: { id: true, ownerId: true, endpoint: true, completada: true, creadoEn: true },
        })
      : [],
    quiere("auditoria")
      ? prisma.auditLog.findMany({
          where: { creadoEn: { gte: opts.desde } },
          orderBy: { creadoEn: "desc" },
          take: limite,
        })
      : [],
    quiere("login")
      ? prisma.loginAttempt.findMany({
          where: { creadoEn: { gte: opts.desde } },
          orderBy: { creadoEn: "desc" },
          take: limite,
        })
      : [],
    quiere("error")
      ? prisma.errorLog.findMany({
          where: { creadoEn: { gte: opts.desde } },
          orderBy: { creadoEn: "desc" },
          take: limite,
          select: { id: true, origen: true, mensaje: true, actorId: true, ownerId: true, creadoEn: true },
        })
      : [],
  ]);
  const nombres = await nombresDe([
    ...ops.map((o) => o.ownerId),
    ...audit.map((a) => a.actorId),
    ...errores.map((e) => e.actorId ?? e.ownerId),
  ]);
  const eventos: EventoActividad[] = [
    ...ops.map((o) => ({
      id: `op-${o.id}`,
      creadoEn: o.creadoEn.toISOString(),
      tipo: "movimiento" as const,
      titulo: etiquetaOperacion(o.endpoint),
      detalle: o.endpoint,
      usuario: nombres.get(o.ownerId) ?? "—",
      ok: o.completada,
    })),
    ...audit.map((a) => ({
      id: `au-${a.id}`,
      creadoEn: a.creadoEn.toISOString(),
      tipo: "auditoria" as const,
      titulo: a.accion,
      detalle: [a.entidad, a.entidadId].filter(Boolean).join(" ") || null,
      usuario: a.actorNombre ?? nombres.get(a.actorId) ?? "—",
      ok: true,
    })),
    ...logins.map((l) => ({
      id: `lg-${l.id}`,
      creadoEn: l.creadoEn.toISOString(),
      tipo: "login" as const,
      titulo: l.exitoso ? "Inicio de sesión" : "Intento fallido",
      detalle: l.ip,
      usuario: l.email,
      ok: l.exitoso,
    })),
    ...errores.map((e) => ({
      id: `er-${e.id}`,
      creadoEn: e.creadoEn.toISOString(),
      tipo: "error" as const,
      titulo: e.mensaje.slice(0, 120),
      detalle: e.origen,
      usuario: nombres.get(e.actorId ?? e.ownerId ?? "") ?? "Anónimo",
      ok: false,
    })),
  ];
  const q = opts.q?.trim().toLowerCase();
  return eventos
    .filter(
      (e) =>
        !q ||
        e.titulo.toLowerCase().includes(q) ||
        e.usuario.toLowerCase().includes(q) ||
        (e.detalle ?? "").toLowerCase().includes(q)
    )
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
    .slice(0, limite);
}

/* ── Usuarios / espacios ──────────────────────────────────────────────── */

export async function getEspacios(desde: Date) {
  const [duenos, ops, ultimos, logins] = await Promise.all([
    prisma.user.findMany({
      where: { workspaceOwnerId: null },
      select: {
        id: true,
        nombre: true,
        email: true,
        creadoEn: true,
        _count: { select: { miembros: true } },
      },
    }),
    prisma.processedOperation.groupBy({
      by: ["ownerId"],
      _count: true,
      where: { creadoEn: { gte: desde } },
    }),
    prisma.processedOperation.groupBy({ by: ["ownerId"], _max: { creadoEn: true } }),
    prisma.loginAttempt.groupBy({
      by: ["email"],
      _max: { creadoEn: true },
      where: { exitoso: true },
    }),
  ]);
  const opsPor = new Map(ops.map((o) => [o.ownerId, o._count]));
  const ultimoPor = new Map(ultimos.map((o) => [o.ownerId, o._max.creadoEn]));
  const loginPor = new Map(logins.map((l) => [l.email.toLowerCase(), l._max.creadoEn]));
  const [contratas, clientes] = await Promise.all([
    prisma.contrata.groupBy({ by: ["ownerId"], _count: true, where: { convertidaADeuda: false } }),
    prisma.cliente.groupBy({ by: ["ownerId"], _count: true }),
  ]);
  const contratasPor = new Map(contratas.map((c) => [c.ownerId, c._count]));
  const clientesPor = new Map(clientes.map((c) => [c.ownerId, c._count]));
  return duenos
    .map((u) => {
      const ultimaOp = ultimoPor.get(u.id) ?? null;
      const ultimoLogin = loginPor.get(u.email.toLowerCase()) ?? null;
      const ultimaVez = [ultimaOp, ultimoLogin]
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        id: u.id,
        nombre: u.nombre ?? u.email,
        email: u.email,
        miembros: u._count.miembros,
        movimientos: opsPor.get(u.id) ?? 0,
        contratas: contratasPor.get(u.id) ?? 0,
        clientes: clientesPor.get(u.id) ?? 0,
        ultimaVez: ultimaVez?.toISOString() ?? null,
        creadoEn: u.creadoEn.toISOString(),
      };
    })
    .sort((a, b) => b.movimientos - a.movimientos || (b.ultimaVez ?? "").localeCompare(a.ultimaVez ?? ""));
}

/* ── Negocio (todos los espacios) ─────────────────────────────────────── */

export async function getNegocio(desde: Date) {
  const [porTipo, cobradoPorDia, deudores, cartera, entregadas] = await Promise.all([
    prisma.contrata.groupBy({
      by: ["tipo"],
      _count: true,
      _sum: { monto: true },
      where: { convertidaADeuda: false },
    }),
    prisma.$queryRaw<{ dia: Date; total: number }[]>`
      SELECT date_trunc('day', "fechaPago") AS dia, SUM("montoAbonado")::float AS total
      FROM "Pago" WHERE "fechaPago" >= ${desde}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ deuda: number | null; abonado: number | null }[]>`
      SELECT (SELECT SUM("deudaInicial") FROM "Deudor")::float AS deuda,
             (SELECT SUM("monto") FROM "AbonoDeudor")::float AS abonado`,
    carteraActiva(),
    prisma.contrata.aggregate({
      _count: true,
      _sum: { monto: true },
      where: { creadoEn: { gte: desde } },
    }),
  ]);
  const d = deudores[0];
  return {
    cartera,
    entregadas: { cantidad: entregadas._count, monto: entregadas._sum.monto ?? 0 },
    porTipo: porTipo.map((t) => ({ tipo: t.tipo, contratas: t._count, capital: t._sum.monto ?? 0 })),
    cobradoPorDia: cobradoPorDia.map((r) => ({ dia: r.dia.toISOString(), total: r.total })),
    deudaViva: Math.round(((d?.deuda ?? 0) - (d?.abonado ?? 0)) * 100) / 100,
    espacios: await getEspacios(desde),
  };
}

/* ── Salud ────────────────────────────────────────────────────────────── */

export async function getSalud() {
  const t0 = Date.now();
  let db = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = false;
  }
  const latenciaDb = Date.now() - t0;
  const [enCurso, erroresHora] = await Promise.all([
    // Reservadas hace más de 2 min sin terminar: una mutación que se murió.
    prisma.processedOperation.count({
      where: { completada: false, creadoEn: { lt: new Date(Date.now() - 2 * 60_000) } },
    }),
    prisma.errorLog.count({ where: { creadoEn: { gte: new Date(Date.now() - 3600_000) } } }),
  ]);
  return {
    db,
    latenciaDb,
    operacionesAtoradas: enCurso,
    erroresUltimaHora: erroresHora,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  };
}

/* ── Utilidades ───────────────────────────────────────────────────────── */

async function nombresDe(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unicos.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nombre: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.nombre ?? u.email]));
}
