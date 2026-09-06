import { prisma } from "@/lib/prisma";
import {
  aggregarEstadoResultados,
  type EstadoResultados,
  type PeriodoEstado,
} from "@/lib/services/estado-resultados";

/**
 * Carga desde Prisma lo que necesita `aggregarEstadoResultados` y arma el
 * reporte del lado del servidor (para el PDF).
 *
 * Vive en su propio archivo, separado del agregador, justamente porque el
 * agregador NO debe importar Prisma: la pantalla lo corre en el navegador
 * sobre IndexedDB. Si el `import { prisma }` viviera allá, se arrastraría
 * al bundle del cliente.
 *
 * Trae TODAS las contratas (activas, liquidadas y convertidas a deuda) —
 * el agregador decide internamente qué cuenta para la foto de hoy y qué
 * para el histórico.
 */
export async function computeEstadoResultados(
  ownerId: string,
  periodo: PeriodoEstado = "MES",
  hoy: Date = new Date()
): Promise<EstadoResultados> {
  const contratas = await prisma.contrata.findMany({
    where: { ownerId },
    select: {
      clienteId: true,
      tipo: true,
      monto: true,
      abono: true,
      numCuotas: true,
      fechaInicio: true,
      convertidaADeuda: true,
      cliente: { select: { nombre: true } },
      pagos: {
        select: {
          pagado: true,
          montoAbonado: true,
          fechaProgramada: true,
          fechaPago: true,
        },
      },
    },
  });

  return aggregarEstadoResultados(
    contratas.map((c) => ({
      clienteId: c.clienteId,
      clienteNombre: c.cliente.nombre,
      tipo: c.tipo,
      monto: c.monto,
      abono: c.abono,
      numCuotas: c.numCuotas,
      fechaInicio: c.fechaInicio,
      convertidaADeuda: c.convertidaADeuda,
      pagos: c.pagos,
    })),
    periodo,
    hoy
  );
}
