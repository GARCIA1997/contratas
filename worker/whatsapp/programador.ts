import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { saldoActual } from "@/lib/services/deudores";
import { PRIORIDAD } from "@/lib/whatsapp-auto/reglas";
import { normalizarTelefono } from "@/lib/whatsapp-auto/telefono";
import { claveDeudor, deudorTocaRecordatorio, recordatoriosDeCuotas } from "@/lib/whatsapp-auto/planificar";
import { conProceso } from "./procesos";

/**
 * Programador de recordatorios (P2). Corre cada hora y al arrancar; mete en
 * la cola lo que toca hoy con `skipDuplicates` sobre `claveDedupe`, así que
 * correrlo varias veces el mismo día no duplica nada. El texto (y el monto)
 * se arma hasta el momento de enviar.
 *
 * Durante una pausa no se generan recordatorios: saldrían con datos viejos.
 */
export async function programarRecordatorios(hoy = new Date()) {
  const cuentas = await prisma.cuentaWhatsApp.findMany({
    where: {
      activo: true,
      pausadaPorAdmin: false,
      pausadaPorUsuario: false,
      OR: [{ porVencer: true }, { vencidas: true }, { deudores: true }],
    },
  });
  for (const cuenta of cuentas) {
    await conProceso("recordatorios", cuenta.id, () => programarCuenta(cuenta, hoy));
  }
}

async function programarCuenta(
  cuenta: { id: string; ownerId: string; porVencer: boolean; vencidas: boolean; deudores: boolean },
  hoy: Date
): Promise<number> {
  const bajas = new Set(
    (await prisma.optOutWhatsApp.findMany({ where: { cuentaId: cuenta.id, activo: true }, select: { telefono: true } })).map(
      (o) => o.telefono
    )
  );
  const filas = [];
  const base = startOfDay(hoy);

  if (cuenta.porVencer || cuenta.vencidas) {
    // Ventana amplia en UTC: el planificador decide con la fecha anclada.
    const pagos = await prisma.pago.findMany({
      where: {
        pagado: false,
        fechaProgramada: { gte: addDays(base, -5), lte: addDays(base, 5) },
        contrata: { ownerId: cuenta.ownerId, convertidaADeuda: false },
      },
      include: { contrata: { include: { cliente: { select: { id: true, nombre: true, telefono: true } } } } },
    });
    const porId = new Map(pagos.map((p) => [`${p.contrataId}:${p.numeroCuota}`, p]));
    const plan = recordatoriosDeCuotas(
      pagos.map((p) => ({
        contrataId: p.contrataId,
        numeroCuota: p.numeroCuota,
        fechaProgramada: p.fechaProgramada,
        pagado: p.pagado,
        montoAbonado: p.montoAbonado,
        abono: p.contrata.abono,
        convertidaADeuda: p.contrata.convertidaADeuda,
      })),
      hoy
    );
    for (const r of plan) {
      if (r.tipo === "POR_VENCER" ? !cuenta.porVencer : !cuenta.vencidas) continue;
      const p = porId.get(`${r.contrataId}:${r.numeroCuota}`)!;
      const telefono = normalizarTelefono(p.contrata.cliente.telefono);
      if (!telefono || bajas.has(telefono)) continue;
      filas.push({
        cuentaId: cuenta.id,
        ownerId: cuenta.ownerId,
        tipo: r.tipo,
        prioridad: PRIORIDAD[r.tipo],
        telefono,
        destinatarioNombre: p.contrata.cliente.nombre,
        clienteId: p.contrata.cliente.id,
        contrataId: r.contrataId,
        numeroCuota: r.numeroCuota,
        claveDedupe: r.claveDedupe,
      });
    }
  }

  if (cuenta.deudores) {
    const deudores = await prisma.deudor.findMany({
      where: { ownerId: cuenta.ownerId, telefono: { not: null } },
      include: { abonos: { orderBy: { fecha: "asc" } } },
    });
    for (const d of deudores) {
      const telefono = normalizarTelefono(d.telefono);
      if (!telefono || bajas.has(telefono)) continue;
      const ultimoRecordatorio = await prisma.mensajeWhatsApp.findFirst({
        where: { deudorId: d.id, tipo: "DEUDOR", estado: { not: "CANCELADO" } },
        orderBy: { creadoEn: "desc" },
        select: { creadoEn: true },
      });
      const toca = deudorTocaRecordatorio({
        saldo: saldoActual(d),
        telefono,
        creadoEn: d.creadoEn,
        ultimoAbono: d.abonos.at(-1)?.fecha ?? null,
        ultimoRecordatorio: ultimoRecordatorio?.creadoEn ?? null,
        hoy,
      });
      if (!toca) continue;
      filas.push({
        cuentaId: cuenta.id,
        ownerId: cuenta.ownerId,
        tipo: "DEUDOR" as const,
        prioridad: PRIORIDAD.DEUDOR,
        telefono,
        destinatarioNombre: d.nombre,
        deudorId: d.id,
        claveDedupe: claveDeudor(d.id, hoy),
      });
    }
  }

  if (filas.length === 0) return 0;
  const r = await prisma.mensajeWhatsApp.createMany({ data: filas, skipDuplicates: true });
  return r.count;
}
