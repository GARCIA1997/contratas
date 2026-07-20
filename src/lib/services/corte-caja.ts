import { startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { prisma } from "@/lib/prisma";
import { saldoPendiente } from "@/lib/contrata";
import { anclarFechaCliente } from "@/lib/fechas";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export type PagoParaCorte = {
  montoAbonado: number;
  pagado: boolean;
  fechaPago: Date | null;
  fechaProgramada: Date;
};

export type ContrataParaCorte = {
  monto: number;
  abono: number;
  numCuotas: number;
  fechaInicio: Date;
  convertidaADeuda: boolean;
  pagos: PagoParaCorte[];
};

export type CorteCajaResultado = {
  anio: number;
  mes: number;
  contratasDadas: number;
  numContratasDadas: number;
  cobrado: number;
  gananciaInteres: number;
  saldoPendienteFin: number;
  contratasActivasFin: number;
};

/**
 * Cierre de un mes: contratas dadas (capital colocado) vs lo cobrado, más
 * la ganancia real (interés, misma proporción que el dashboard) y la
 * cartera pendiente al momento del cierre. Pura — sin Prisma — para poder
 * probarla sin BD.
 */
export function aggregarCorteCaja(
  contratas: ContrataParaCorte[],
  anio: number,
  mes: number
): CorteCajaResultado {
  const rango = {
    start: startOfMonth(new Date(anio, mes - 1, 1)),
    end: endOfMonth(new Date(anio, mes - 1, 1)),
  };

  let contratasDadas = 0;
  let numContratasDadas = 0;
  let cobrado = 0;
  let gananciaInteres = 0;
  let saldoPendienteFin = 0;
  let contratasActivasFin = 0;

  for (const c of contratas) {
    if (isWithinInterval(anclarFechaCliente(c.fechaInicio), rango)) {
      contratasDadas = round(contratasDadas + c.monto);
      numContratasDadas += 1;
    }

    const totalPactado = c.abono * c.numCuotas;
    const interesPactado = Math.max(totalPactado - c.monto, 0);
    const proporcionInteres =
      totalPactado > 0 ? interesPactado / totalPactado : 0;

    for (const p of c.pagos) {
      if (!p.pagado || !p.fechaPago) continue;
      if (!isWithinInterval(p.fechaPago, rango)) continue;
      cobrado = round(cobrado + p.montoAbonado);
      gananciaInteres = round(
        gananciaInteres + p.montoAbonado * proporcionInteres
      );
    }

    if (c.convertidaADeuda) continue;
    const activa = c.pagos.some((p) => !p.pagado);
    if (activa) {
      contratasActivasFin += 1;
      saldoPendienteFin = round(
        saldoPendienteFin + saldoPendiente(c.pagos, c.abono)
      );
    }
  }

  return {
    anio,
    mes,
    contratasDadas,
    numContratasDadas,
    cobrado,
    gananciaInteres,
    saldoPendienteFin,
    contratasActivasFin,
  };
}

async function contratasParaCorte(ownerId: string) {
  return prisma.contrata.findMany({
    where: { ownerId },
    select: {
      monto: true,
      abono: true,
      numCuotas: true,
      fechaInicio: true,
      convertidaADeuda: true,
      pagos: {
        select: {
          montoAbonado: true,
          pagado: true,
          fechaPago: true,
          fechaProgramada: true,
        },
      },
    },
  });
}

/**
 * Genera (o regenera) el corte de un mes específico y lo guarda. Un corte
 * ya generado se puede volver a llamar (ej. corrección de datos) — se
 * sobrescribe con `upsert`, no se acumulan versiones.
 */
export async function generarCorteCaja(
  ownerId: string,
  anio: number,
  mes: number
) {
  const contratas = await contratasParaCorte(ownerId);
  const resultado = aggregarCorteCaja(contratas, anio, mes);

  return prisma.corteCaja.upsert({
    where: { ownerId_anio_mes: { ownerId, anio, mes } },
    update: resultado,
    create: { ownerId, ...resultado },
  });
}

/** Genera el corte del mes en curso para TODOS los owners — usado por el cron. */
export async function generarCorteCajaTodosLosOwners(hoy: Date = new Date()) {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth() + 1;

  const owners = await prisma.user.findMany({
    where: { workspaceOwnerId: null },
    select: { id: true },
  });

  const resultados = [];
  for (const { id: ownerId } of owners) {
    resultados.push(await generarCorteCaja(ownerId, anio, mes));
  }
  return { anio, mes, generados: resultados.length };
}

export async function listCortesCaja(ownerId: string) {
  return prisma.corteCaja.findMany({
    where: { ownerId },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
  });
}

export async function getCorteCaja(ownerId: string, id: string) {
  return prisma.corteCaja.findFirst({ where: { id, ownerId } });
}
