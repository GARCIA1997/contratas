import { startOfDay, addDays } from "date-fns";
import type { TipoContrata } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { anclarFechaCliente } from "@/lib/fechas";
import { DIAS_PROXIMO_VENCIMIENTO } from "@/lib/contrata";
import type { ContrataResumenCobro } from "@/lib/services/cobros";

/**
 * Reparto de un abono parcial entre las contratas de un cliente.
 *
 * El problema que resuelve: "Cobrar pendiente" asume que el cliente paga el
 * 100% de lo que debe. En campo, muchas veces da menos — y con varias
 * contratas activas, decidir a mano a cuál le toca qué es lento y propenso
 * a error (es dinero real). Aquí se automatiza con una prioridad de negocio
 * acordada explícitamente:
 *
 *  1. Primero se completa "la cuota de la semana" de TODAS las contratas
 *     (la pendiente más reciente que ya venció o está por vencer). Si no
 *     alcanza para todas, se completan en orden de prioridad y la última
 *     que alcanza a tocar se queda con abono parcial — las que siguen no
 *     reciben nada en esta pasada.
 *  2. Solo si sobra después de cubrir TODA la semana, se pasa a las cuotas
 *     atrasadas (las más viejas que la de la semana, de esa misma
 *     contrata) — pero aquí se drena completo: a la contrata de mayor
 *     prioridad se le paga toda su atrasada que se pueda antes de tocar
 *     la siguiente, no se reparte parejo.
 *  3. Si aún sobra tras dejar todo al día, se adelanta a cuotas futuras
 *     (todavía no vencen), mismo criterio de prioridad y de drenar
 *     completo.
 *
 * La prioridad entre contratas es "a la que le falten menos cuotas por
 * pagar le toca primero" — la idea es sacarla de la lista cuanto antes en
 * vez de dejar varias contratas a medias. Empate se rompe por `contrataId`
 * para que el resultado sea siempre el mismo con los mismos datos.
 *
 * Puro y sin Prisma a propósito (igual que `agruparCobroPorContrata` en
 * `services/cobros.ts`): el espejo offline en `offline/effects.ts` importa
 * esta misma función para aplicar el abono en IndexedDB sin conexión, con
 * exactamente el mismo resultado que calculará el servidor al sincronizar.
 */

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export type PagoParaAbono = {
  id: string;
  numeroCuota: number;
  pagado: boolean;
  montoAbonado: number;
  fechaProgramada: string | Date;
};

export type ContrataParaAbono = {
  contrataId: string;
  tipo: TipoContrata;
  /** Capital prestado — se muestra junto al tipo en el desglose del abono. */
  monto: number;
  abono: number;
  numCuotas: number;
  pagos: PagoParaAbono[];
};

export type AplicacionCuota = {
  contrataId: string;
  pagoId: string;
  numeroCuota: number;
  /** Cuánto de este abono se aplicó a esta cuota específica. */
  montoAplicado: number;
  /** true si con esto la cuota queda completamente pagada. */
  quedaPagada: boolean;
};

export type ResultadoAbono = {
  aplicaciones: AplicacionCuota[];
  totalAplicado: number;
  /**
   * Dinero que no se pudo aplicar porque cubre más de TODO lo que las
   * contratas del cliente deben (incluyendo cuotas futuras). Nunca se
   * inventa un destino para esto — el llamador debe avisar y pedir
   * revisar el monto, no aplicarlo a ciegas.
   */
  sobranteNoAplicado: number;
  /** Listo para alimentar `mensajeCobro` — solo contratas que recibieron algo. */
  contratas: ContrataResumenCobro[];
};

type CuotaPendiente = {
  pagoId: string;
  numeroCuota: number;
  pendiente: number;
};

type ContrataProcesada = {
  contrataId: string;
  tipo: TipoContrata;
  monto: number;
  numCuotas: number;
  cuotasRestantes: number;
  semana: CuotaPendiente | null;
  atrasadas: CuotaPendiente[];
  futuras: CuotaPendiente[];
};

/** Separa las cuotas pendientes de una contrata en semana / atrasadas / futuras. */
function procesarContrata(c: ContrataParaAbono, limite: Date): ContrataProcesada {
  const pendientes = c.pagos
    .filter((p) => !p.pagado)
    .map((p) => ({
      pagoId: p.id,
      numeroCuota: p.numeroCuota,
      pendiente: round(c.abono - p.montoAbonado),
      fecha: anclarFechaCliente(p.fechaProgramada),
    }))
    .filter((p) => p.pendiente > 0);

  const enVentana = pendientes
    .filter((p) => p.fecha <= limite)
    .sort((a, b) => a.numeroCuota - b.numeroCuota);
  const futuras = pendientes
    .filter((p) => p.fecha > limite)
    .sort((a, b) => a.numeroCuota - b.numeroCuota)
    .map(({ pagoId, numeroCuota, pendiente }) => ({ pagoId, numeroCuota, pendiente }));

  // La más reciente dentro de la ventana (vencida o por vencer) es "la de
  // la semana"; cualquier otra más vieja en esa misma ventana ya es atraso.
  const semana = enVentana.length > 0 ? enVentana[enVentana.length - 1] : null;
  const atrasadas = enVentana
    .slice(0, -1)
    .map(({ pagoId, numeroCuota, pendiente }) => ({ pagoId, numeroCuota, pendiente }));

  return {
    contrataId: c.contrataId,
    tipo: c.tipo,
    monto: c.monto,
    numCuotas: c.numCuotas,
    cuotasRestantes: c.pagos.filter((p) => !p.pagado).length,
    semana: semana
      ? { pagoId: semana.pagoId, numeroCuota: semana.numeroCuota, pendiente: semana.pendiente }
      : null,
    atrasadas,
    futuras,
  };
}

export function distribuirAbono(
  contratas: ContrataParaAbono[],
  monto: number,
  hoy: Date = new Date()
): ResultadoAbono {
  const limite = addDays(startOfDay(hoy), DIAS_PROXIMO_VENCIMIENTO);
  const procesadas = contratas.map((c) => procesarContrata(c, limite));

  // Prioridad: la que le falten menos cuotas va primero; empate por id
  // para que el resultado sea determinista con los mismos datos.
  const orden = [...procesadas].sort(
    (a, b) => a.cuotasRestantes - b.cuotasRestantes || a.contrataId.localeCompare(b.contrataId)
  );

  const aplicaciones: AplicacionCuota[] = [];
  let restante = round(Math.max(0, monto));

  function aplicar(contrataId: string, cuota: CuotaPendiente): boolean {
    if (restante <= 0) return false;
    const monto = Math.min(restante, cuota.pendiente);
    aplicaciones.push({
      contrataId,
      pagoId: cuota.pagoId,
      numeroCuota: cuota.numeroCuota,
      montoAplicado: monto,
      quedaPagada: monto >= cuota.pendiente,
    });
    restante = round(restante - monto);
    return restante > 0;
  }

  // Etapa 1 — la semana de todas, antes que cualquier otra cosa.
  for (const c of orden) {
    if (!c.semana) continue;
    if (!aplicar(c.contrataId, c.semana)) break;
  }

  // Etapa 2 — atrasadas, solo si ya se cubrió TODA la semana. Se drena
  // completo por contrata (no se reparte parejo) antes de pasar a la
  // siguiente en la fila.
  if (restante > 0) {
    etapa2: for (const c of orden) {
      for (const cuota of c.atrasadas) {
        if (!aplicar(c.contrataId, cuota)) break etapa2;
      }
    }
  }

  // Etapa 3 — adelanto a futuras, solo si ya no queda NADA pendiente.
  if (restante > 0) {
    etapa3: for (const c of orden) {
      for (const cuota of c.futuras) {
        if (!aplicar(c.contrataId, cuota)) break etapa3;
      }
    }
  }

  const porContrata = new Map<string, ContrataResumenCobro>();
  for (const a of aplicaciones) {
    const info = procesadas.find((c) => c.contrataId === a.contrataId)!;
    const actual = porContrata.get(a.contrataId);
    if (actual) {
      actual.cuotas.push({ numeroCuota: a.numeroCuota, monto: a.montoAplicado });
      actual.subtotal = round(actual.subtotal + a.montoAplicado);
    } else {
      porContrata.set(a.contrataId, {
        contrataId: a.contrataId,
        tipo: info.tipo,
        montoContrata: info.monto,
        numCuotas: info.numCuotas,
        cuotas: [{ numeroCuota: a.numeroCuota, monto: a.montoAplicado }],
        subtotal: a.montoAplicado,
      });
    }
  }

  return {
    aplicaciones,
    totalAplicado: round(aplicaciones.reduce((s, a) => s + a.montoAplicado, 0)),
    sobranteNoAplicado: restante,
    contratas: Array.from(porContrata.values()),
  };
}

export type ResultadoAbonoParcial = ResultadoAbono & {
  clienteNombre: string;
  clienteTelefono: string | null;
};

/**
 * Aplica un abono parcial en la base de datos. A diferencia de
 * `ejecutarCobroVencidas`, aquí sí hace falta cargar TODAS las cuotas de
 * cada contrata (incluidas las futuras) — el reparto puede llegar a
 * adelantar pagos si el monto alcanza para más de lo que hoy está vencido
 * o por vencer.
 */
export async function ejecutarAbonoParcial(
  ownerId: string,
  clienteId: string,
  monto: number,
  hoy: Date = new Date()
): Promise<ResultadoAbonoParcial> {
  if (monto <= 0) throw new HttpError(400, "El monto debe ser mayor a cero");

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, ownerId },
    select: { id: true, nombre: true, telefono: true },
  });
  if (!cliente) throw new HttpError(404, "Cliente no encontrado");

  const contratas = await prisma.contrata.findMany({
    where: { ownerId, clienteId, convertidaADeuda: false },
    include: { pagos: true },
  });

  const paraAbono: ContrataParaAbono[] = contratas.map((c) => ({
    contrataId: c.id,
    tipo: c.tipo,
    monto: c.monto,
    abono: c.abono,
    numCuotas: c.pagos.length,
    pagos: c.pagos.map((p) => ({
      id: p.id,
      numeroCuota: p.numeroCuota,
      pagado: p.pagado,
      montoAbonado: p.montoAbonado,
      fechaProgramada: p.fechaProgramada,
    })),
  }));

  const resultado = distribuirAbono(paraAbono, monto, hoy);
  if (resultado.aplicaciones.length === 0) {
    throw new HttpError(400, "No hay cuotas pendientes para abonar");
  }
  if (resultado.sobranteNoAplicado > 0) {
    throw new HttpError(
      400,
      `El monto es mayor a todo lo que el cliente debe — sobran ${resultado.sobranteNoAplicado}`
    );
  }

  const ahora = new Date();
  await prisma.$transaction(
    resultado.aplicaciones.map((a) =>
      prisma.pago.update({
        where: { id: a.pagoId },
        data: {
          montoAbonado: { increment: a.montoAplicado },
          ...(a.quedaPagada ? { pagado: true, fechaPago: ahora } : {}),
        },
      })
    )
  );

  return {
    ...resultado,
    clienteNombre: cliente.nombre,
    clienteTelefono: cliente.telefono,
  };
}
