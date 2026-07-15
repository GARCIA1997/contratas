import { PrismaClient } from "@prisma/client";
import {
  addDays,
  addMonths,
  getDate,
  getDay,
  lastDayOfMonth,
  setDate,
  startOfDay,
} from "date-fns";
import fs from "node:fs";

const prisma = new PrismaClient();

type RawContrata = {
  num: number;
  nombre: string;
  mes: string;
  monto: number;
  abono: number;
  fechaInicio: string | null;
  fechas: (string | null)[];
  pagados: number;
  saldo: number;
  notas: string | null;
};

type RawDeudor = {
  nombre: string;
  deudaInicial: number;
  notasInicial: string | null;
  abonos: { fecha: string; monto: number; restante: number; notas: string | null }[];
};

const MESES: Record<string, number> = {
  ENE: 0, FEB: 1, MAR: 2, ABR: 3, MAY: 4, JUN: 5,
  JUL: 6, AGO: 7, SEP: 8, OCT: 9, NOV: 10, DIC: 11,
};

function parseMes(mes: string): Date {
  const [abbr, year] = mes.split(" ");
  return new Date(Number(year), MESES[abbr], 1);
}

/** Lunes más cercano a la fecha dada (si ya es lunes, la deja igual). */
function alinearALunes(d: Date): Date {
  const day = getDay(d); // 0=domingo..6=sábado
  const diff = day === 0 ? -6 : 1 - day; // desplazamiento al lunes de esa semana
  return startOfDay(addDays(d, diff));
}

/** Primer lunes del mes de la fecha dada (el lunes en/después del día 1). */
function primerLunesDelMes(d: Date): Date {
  const primero = startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
  const day = getDay(primero); // 0=domingo..6=sábado
  const diff = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  return addDays(primero, diff);
}

/** Día 15 o último día del mes más cercano a la fecha dada. */
function alinearAQuincena(d: Date): Date {
  const dia = getDate(d);
  const ultimo = getDate(lastDayOfMonth(d));
  const dist15 = Math.abs(dia - 15);
  const distUltimo = Math.abs(dia - ultimo);
  return startOfDay(distUltimo < dist15 ? lastDayOfMonth(d) : setDate(d, 15));
}

function siguienteQuincenaFija(desde: Date): Date {
  const dia = getDate(desde);
  const ultimo = getDate(lastDayOfMonth(desde));
  if (dia < 15) return setDate(desde, 15);
  if (dia < ultimo) return lastDayOfMonth(desde);
  return setDate(addMonths(desde, 1), 15);
}

function calcularFechasSemanal(fechaInicio: Date, numCuotas: number): Date[] {
  const inicio = startOfDay(fechaInicio);
  const fechas: Date[] = [];
  for (let n = 1; n <= numCuotas; n++) fechas.push(addDays(inicio, n * 7));
  return fechas;
}

function calcularFechasQuincenal(fechaInicio: Date, numCuotas: number): Date[] {
  let cursor = startOfDay(fechaInicio);
  const fechas: Date[] = [];
  for (let n = 1; n <= numCuotas; n++) {
    cursor = siguienteQuincenaFija(cursor);
    fechas.push(cursor);
  }
  return fechas;
}

async function resolverCliente(ownerId: string, nombre: string, cache: Map<string, string>) {
  const key = nombre.trim().toUpperCase();
  if (cache.has(key)) return cache.get(key)!;
  const existente = await prisma.cliente.findFirst({ where: { ownerId, nombre: key } });
  if (existente) {
    cache.set(key, existente.id);
    return existente.id;
  }
  const creado = await prisma.cliente.create({ data: { ownerId, nombre: key } });
  cache.set(key, creado.id);
  return creado.id;
}

async function importarContratas(
  ownerId: string,
  items: RawContrata[],
  tipo: "SEMANAL" | "QUINCENAL",
  clienteCache: Map<string, string>
) {
  let creadas = 0;
  for (const item of items) {
    const numCuotas = 10;
    let fechaInicioApp: Date;

    if (item.fechaInicio) {
      const base = new Date(item.fechaInicio);
      if (tipo === "SEMANAL") {
        // La cuota 1 (S1) debe caer en lunes → fechaInicio (S1 - 7 días) también es lunes.
        const s1 = item.fechas[0] ? new Date(item.fechas[0]) : addDays(base, 7);
        const s1Lunes = alinearALunes(s1);
        fechaInicioApp = addDays(s1Lunes, -7);
      } else {
        fechaInicioApp = alinearAQuincena(base);
      }
    } else {
      // Sin fecha registrada (contratas antiguas ya liquidadas) → derivar del mes.
      const primerDiaMes = parseMes(item.mes);
      fechaInicioApp =
        tipo === "SEMANAL"
          ? addDays(primerLunesDelMes(primerDiaMes), -7)
          : setDate(primerDiaMes, 15);
    }

    const fechasCuotas =
      tipo === "SEMANAL"
        ? calcularFechasSemanal(fechaInicioApp, numCuotas)
        : calcularFechasQuincenal(fechaInicioApp, numCuotas);

    const clienteId = await resolverCliente(ownerId, item.nombre, clienteCache);

    const mesLabel = item.mes;
    const pagados = item.pagados ?? 0;

    await prisma.contrata.create({
      data: {
        ownerId,
        clienteId,
        tipo,
        monto: item.monto,
        abono: item.abono,
        fechaInicio: fechaInicioApp,
        numCuotas,
        mes: mesLabel,
        notas: item.notas ?? null,
        pagos: {
          create: fechasCuotas.map((fechaProgramada, i) => ({
            numeroCuota: i + 1,
            fechaProgramada,
            pagado: i < pagados,
            fechaPago: i < pagados ? fechaProgramada : null,
          })),
        },
      },
    });
    creadas++;
  }
  return creadas;
}

async function importarDeudores(ownerId: string, deudores: RawDeudor[]) {
  let creados = 0;
  for (const d of deudores) {
    const primerAbono = d.abonos[0];
    const deudaInicial =
      primerAbono ? primerAbono.restante + primerAbono.monto : d.deudaInicial;

    const deudor = await prisma.deudor.create({
      data: {
        ownerId,
        nombre: d.nombre.trim().toUpperCase(),
        deudaInicial,
        notas: d.notasInicial,
      },
    });

    for (const a of d.abonos) {
      // fecha viene como "30/MAR/2026"
      const [dia, mesAbr, anio] = a.fecha.split("/");
      const fecha = new Date(Number(anio), MESES[mesAbr], Number(dia));
      await prisma.abonoDeudor.create({
        data: {
          deudorId: deudor.id,
          fecha,
          monto: a.monto,
          restante: a.restante,
          notas: a.notas,
        },
      });
    }
    creados++;
  }
  return creados;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync("/tmp/import_data.json", "utf-8")) as {
    semanales: RawContrata[];
    quincenales: RawContrata[];
    deudores: RawDeudor[];
  };

  const admin = await prisma.user.findFirst({ where: { rol: "ADMIN" } });
  if (!admin) throw new Error("No se encontró usuario ADMIN");
  console.log(`Importando datos para: ${admin.email} (${admin.id})`);

  const clienteCache = new Map<string, string>();

  const nSem = await importarContratas(admin.id, raw.semanales, "SEMANAL", clienteCache);
  console.log(`✓ ${nSem} contratas semanales importadas`);

  const nQuin = await importarContratas(admin.id, raw.quincenales, "QUINCENAL", clienteCache);
  console.log(`✓ ${nQuin} contratas quincenales importadas`);

  const nDeu = await importarDeudores(admin.id, raw.deudores);
  console.log(`✓ ${nDeu} deudores importados`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
