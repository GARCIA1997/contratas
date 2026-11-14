import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { saldoActual } from "@/lib/services/deudores";
import { PRIORIDAD } from "@/lib/whatsapp-auto/reglas";
import { normalizarTelefono } from "@/lib/whatsapp-auto/telefono";
import { claveDeudor, deudorTocaRecordatorio, GRACIA_VENCIDA_DIAS, recordatoriosDeCuotas } from "@/lib/whatsapp-auto/planificar";
import { ajustesDe, ultimoDiaVencida, type AjustesEnvio } from "@/lib/whatsapp-auto/ajustes-envio";
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
  cuenta: { id: string; ownerId: string; porVencer: boolean; vencidas: boolean; deudores: boolean } & Partial<AjustesEnvio>,
  hoy: Date
): Promise<number> {
  const filas = [];
  const base = startOfDay(hoy);
  const ajustes = ajustesDe(cuenta);

  if (cuenta.porVencer || cuenta.vencidas) {
    // Ventana amplia en UTC: el planificador decide con la fecha anclada.
    const pagos = await prisma.pago.findMany({
      where: {
        pagado: false,
        // Lo más atrás que puede tocar un aviso de vencida (con repeticiones) y lo
        // más adelante que puede tocar uno de "por vencer", con un día de holgura
        // por la zona horaria.
        fechaProgramada: {
          gte: addDays(base, -(ultimoDiaVencida(ajustes, GRACIA_VENCIDA_DIAS) + 2)),
          lte: addDays(base, Math.max(...ajustes.avisoDiasAntes) + 2),
        },
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
      hoy,
      ajustes
    );
    for (const r of plan) {
      if (r.tipo === "POR_VENCER" ? !cuenta.porVencer : !cuenta.vencidas) continue;
      const p = porId.get(`${r.contrataId}:${r.numeroCuota}`)!;
      const telefono = normalizarTelefono(p.contrata.cliente.telefono);
      if (!telefono) continue;
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
      if (!telefono) continue;
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
        cadaDias: ajustes.diasEntreDeudor,
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
