import { startOfDay, addDays, differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { anclarFechaCliente } from "@/lib/fechas";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export type PagoParaRuta = {
  numeroCuota: number;
  fechaProgramada: Date;
  pagado: boolean;
  montoAbonado: number;
};

export type ContrataParaRuta = {
  id: string;
  abono: number;
  convertidaADeuda: boolean;
  pagos: PagoParaRuta[];
};

export type ClienteParaRuta = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  contratas: ContrataParaRuta[];
};

export type CuotaRuta = {
  contrataId: string;
  numeroCuota: number;
  pendiente: number;
  fechaProgramada: string;
  diasAtraso: number;
};

export type ParadaRuta = {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  total: number;
  cuotas: CuotaRuta[];
  diasAtrasoMax: number;
};

// Un cobrador sale con 2-3 días de anticipación a visitar zonas alejadas, así
// que un pago programado para el domingo debe aparecer en la ruta desde el
// viernes (pedido explícito en campo) — no hasta el mismo día.
const DIAS_ANTICIPACION_RUTA = 2;

/**
 * Clientes con cuotas vencidas, que vencen hoy, o que vencen dentro de
 * `DIAS_ANTICIPACION_RUTA` días, pendientes de cobro — la lista de a quién
 * visitar hoy, ordenada por más atrasado primero (y las próximas a vencer al
 * final).
 */
export function aggregarRutaDelDia(
  clientes: ClienteParaRuta[],
  hoy: Date = new Date()
): ParadaRuta[] {
  const base = startOfDay(hoy);
  const limite = addDays(base, DIAS_ANTICIPACION_RUTA);
  const paradas: ParadaRuta[] = [];

  for (const cliente of clientes) {
    const cuotas: CuotaRuta[] = [];
    for (const c of cliente.contratas) {
      if (c.convertidaADeuda) continue;
      for (const p of c.pagos) {
        if (p.pagado) continue;
        const fechaCuota = anclarFechaCliente(p.fechaProgramada);
        if (fechaCuota > limite) continue;
        const pendiente = round(c.abono - p.montoAbonado);
        if (pendiente <= 0) continue;
        cuotas.push({
          contrataId: c.id,
          numeroCuota: p.numeroCuota,
          pendiente,
          fechaProgramada: p.fechaProgramada.toISOString(),
          // Positivo = vencida hace N días, 0 = hoy, negativo = vence en N
          // días (ya no se recorta a 0 — antes una cuota "próxima" se veía
          // idéntica a una de hoy en la UI).
          diasAtraso: differenceInCalendarDays(base, fechaCuota),
        });
      }
    }
    if (cuotas.length === 0) continue;
    cuotas.sort((a, b) => b.diasAtraso - a.diasAtraso);
    paradas.push({
      clienteId: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      total: round(cuotas.reduce((s, q) => s + q.pendiente, 0)),
      cuotas,
      diasAtrasoMax: cuotas[0].diasAtraso,
    });
  }

  paradas.sort((a, b) => b.diasAtrasoMax - a.diasAtrasoMax || b.total - a.total);
  return paradas;
}

export async function computeRutaDelDia(
  ownerId: string,
  hoy: Date = new Date()
): Promise<ParadaRuta[]> {
  const clientes = await prisma.cliente.findMany({
    where: { ownerId },
    include: { contratas: { include: { pagos: true } } },
  });

  return aggregarRutaDelDia(
    clientes.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      direccion: c.direccion,
      contratas: c.contratas.map((k) => ({
        id: k.id,
        abono: k.abono,
        convertidaADeuda: k.convertidaADeuda,
        pagos: k.pagos.map((p) => ({
          numeroCuota: p.numeroCuota,
          fechaProgramada: p.fechaProgramada,
          pagado: p.pagado,
          montoAbonado: p.montoAbonado,
        })),
      })),
    })),
    hoy
  );
}
