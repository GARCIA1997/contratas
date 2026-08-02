import { startOfDay, addDays } from "date-fns";
import { db } from "@/lib/offline/db";
import type { QueueOpType } from "@/lib/offline/db";
import { DIAS_PROXIMO_VENCIMIENTO } from "@/lib/contrata";
import { anclarFechaCliente } from "@/lib/fechas";

/**
 * Aplica el efecto local (optimista) de una operación encolada directamente
 * en Dexie. Deliberadamente más simple que el servicio equivalente en
 * src/lib/services/contratas.ts: solo actualiza la caché de lectura, no
 * reemplaza la validación/autoridad del servidor, que sigue aplicando la
 * mutación real cuando la cola se vacía.
 */
export async function applyLocalEffect(
  type: QueueOpType,
  payload: Record<string, unknown>
): Promise<void> {
  if (!db) return;

  if (type === "contrata.pago.toggle") {
    const { contrataId, numeroCuota } = payload as {
      contrataId: string;
      numeroCuota: number;
    };
    const contrata = await db.contratas.get(contrataId);
    if (!contrata) return;
    const pago = (
      await db.pagos.where("contrataId").equals(contrataId).toArray()
    ).find((p) => p.numeroCuota === numeroCuota);
    if (!pago) return;
    const pagado = !pago.pagado;
    await db.pagos.update(pago.id, {
      pagado,
      fechaPago: pagado ? new Date().toISOString() : null,
      montoAbonado: pagado ? contrata.abono : 0,
    });
    await db.contratas.update(contrataId, { _dirty: true });
    return;
  }

  if (type === "contrata.pago.abonar") {
    const { contrataId, numeroCuota, monto } = payload as {
      contrataId: string;
      numeroCuota: number;
      monto: number;
    };
    const contrata = await db.contratas.get(contrataId);
    if (!contrata) return;
    const pago = (
      await db.pagos.where("contrataId").equals(contrataId).toArray()
    ).find((p) => p.numeroCuota === numeroCuota);
    if (!pago) return;
    const nuevoMonto = Math.round((pago.montoAbonado + monto) * 100) / 100;
    const pagado = nuevoMonto >= contrata.abono - 0.01;
    await db.pagos.update(pago.id, {
      montoAbonado: nuevoMonto,
      pagado,
      fechaPago: pagado ? pago.fechaPago ?? new Date().toISOString() : pago.fechaPago,
    });
    await db.contratas.update(contrataId, { _dirty: true });
    return;
  }

  if (type === "contrata.pago.revertir") {
    const { contrataId, numeroCuota } = payload as {
      contrataId: string;
      numeroCuota: number;
    };
    const pago = (
      await db.pagos.where("contrataId").equals(contrataId).toArray()
    ).find((p) => p.numeroCuota === numeroCuota);
    if (!pago) return;
    await db.pagos.update(pago.id, {
      montoAbonado: 0,
      pagado: false,
      fechaPago: null,
    });
    await db.contratas.update(contrataId, { _dirty: true });
    return;
  }

  if (type === "contrata.marcarDeuda") {
    const { contrataId } = payload as { contrataId: string };
    // Efecto optimista simplificado: solo saca la contrata de la lista de
    // activas. El registro/actualización del Deudor correspondiente (que
    // requiere reconciliar un posible ID nuevo) se refleja recién con el
    // siguiente pull-sync después de que el servidor confirme la operación.
    await db.contratas.update(contrataId, {
      convertidaADeuda: true,
      _dirty: true,
    });
    return;
  }

  if (type === "contrata.crear") {
    // No hay nada que aplicar localmente: no existe todavía ni el id de la
    // contrata ni el de un cliente nuevo (si se creó con clienteNombre en
    // vez de clienteId) — ambos los asigna el servidor. Igual que
    // "contrata.renovar", se espera al pull-sync tras confirmarse (ver
    // reconciliarTrasExito en queue.ts) para que aparezca en las listas.
    return;
  }

  if (type === "contrata.editar") {
    const { contrataId, input } = payload as {
      contrataId: string;
      input: {
        tipo?: "SEMANAL" | "QUINCENAL" | "MENSUAL";
        monto?: number;
        abono?: number;
        numCuotas?: number;
        fechaInicio?: string;
        notas?: string | null;
      };
    };
    // Efecto optimista simplificado: solo los campos simples. Si cambió
    // tipo/numCuotas/fechaInicio el calendario de cuotas real (que el
    // servidor recalcula borrando y recreando Pago) se deja tal cual hasta
    // el próximo pull-sync — replicar `calcularFechasPago` aquí duplicaría
    // lógica financiera con más riesgo que beneficio.
    await db.contratas.update(contrataId, {
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
      ...(input.monto !== undefined ? { monto: input.monto } : {}),
      ...(input.abono !== undefined ? { abono: input.abono } : {}),
      ...(input.numCuotas !== undefined ? { numCuotas: input.numCuotas } : {}),
      ...(input.fechaInicio !== undefined
        ? { fechaInicio: input.fechaInicio }
        : {}),
      ...(input.notas !== undefined ? { notas: input.notas } : {}),
      _dirty: true,
    });
    return;
  }

  if (type === "contrata.renovar") {
    const { contrataId, otrasIds } = payload as {
      contrataId: string;
      otrasIds: string[];
    };
    // No se crea la contrata nueva localmente (no se conoce su id ni sus
    // fechas reales todavía) — solo se marcan como "sincronizando" las
    // contratas involucradas. El pull-sync tras confirmar trae la contrata
    // nueva real y el estado final de las demás.
    await db.contratas.update(contrataId, { _dirty: true });
    for (const id of otrasIds) {
      await db.contratas.update(id, { _dirty: true });
    }
    return;
  }

  if (type === "cliente.unificar") {
    const { contrataIds } = payload as { contrataIds: string[] };
    for (const id of contrataIds) {
      await db.contratas.update(id, { _dirty: true });
    }
    return;
  }

  if (type === "contrata.eliminar") {
    const { contrataId } = payload as { contrataId: string };
    await db.contratas.update(contrataId, {
      _deletedAt: new Date().toISOString(),
      _dirty: true,
    });
    return;
  }

  if (type === "deudor.abonar") {
    const { deudorId, abonoLocalId, fecha, monto, notas } = payload as {
      deudorId: string;
      abonoLocalId: string;
      fecha: string;
      monto: number;
      notas: string | null;
    };
    const deudor = await db.deudores.get(deudorId);
    if (!deudor) return;
    const restante = Math.round((deudor.saldoActual - monto) * 100) / 100;
    await db.abonosDeudor.put({
      id: abonoLocalId,
      deudorId,
      ownerId: deudor.ownerId,
      fecha,
      monto,
      restante,
      notas,
    });
    await db.deudores.update(deudorId, {
      saldoActual: restante,
      numAbonos: deudor.numAbonos + 1,
      _dirty: true,
    });
    return;
  }

  if (type === "cliente.cobrarVencidas") {
    const { clienteId } = payload as { clienteId: string };
    const contratas = (
      await db.contratas.where("clienteId").equals(clienteId).toArray()
    ).filter((c) => !c._deletedAt && !c.convertidaADeuda);
    const ahora = new Date().toISOString();
    // Mismo umbral que previewCobroVencidas/getCobroVencidoPreview: vencidas
    // Y próximas (no solo cuotasVencidasOVigentes, que se corta en "hoy") —
    // si no, el efecto optimista offline dejaría sin marcar las cuotas
    // "próximas" que sí incluyó el total mostrado, hasta que sincronizara.
    const base = startOfDay(new Date());
    const limite = addDays(base, DIAS_PROXIMO_VENCIMIENTO);
    for (const c of contratas) {
      const pagos = await db.pagos.where("contrataId").equals(c.id).toArray();
      const pendientes = pagos.filter(
        (p) => !p.pagado && anclarFechaCliente(new Date(p.fechaProgramada)) <= limite
      );
      if (pendientes.length === 0) continue;
      for (const p of pendientes) {
        await db.pagos.update(p.id, {
          pagado: true,
          montoAbonado: c.abono,
          fechaPago: ahora,
        });
      }
      await db.contratas.update(c.id, { _dirty: true });
    }
    return;
  }
}
