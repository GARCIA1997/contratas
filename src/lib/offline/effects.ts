import { db } from "@/lib/offline/db";
import type { QueueOpType } from "@/lib/offline/db";
import { cuotasVencidasOVigentes } from "@/lib/contrata";

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
    for (const c of contratas) {
      const pagos = await db.pagos.where("contrataId").equals(c.id).toArray();
      const pagosConFecha = pagos.map((p) => ({
        ...p,
        fechaProgramada: new Date(p.fechaProgramada),
      }));
      const vencidas = cuotasVencidasOVigentes(pagosConFecha);
      if (vencidas.length === 0) continue;
      for (const p of vencidas) {
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
