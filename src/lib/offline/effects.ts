import { startOfDay, addDays } from "date-fns";
import { db } from "@/lib/offline/db";
import type { QueueOpType } from "@/lib/offline/db";
import { DIAS_PROXIMO_VENCIMIENTO } from "@/lib/contrata";
import { anclarFechaCliente } from "@/lib/fechas";
import { distribuirAbono } from "@/lib/services/abono";

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

  if (type === "cliente.abonarParcial") {
    const { clienteId, monto } = payload as { clienteId: string; monto: number };
    const contratas = (
      await db.contratas.where("clienteId").equals(clienteId).toArray()
    ).filter((c) => !c._deletedAt && !c.convertidaADeuda);

    const pagosPorId = new Map<string, { montoAbonado: number }>();
    const paraAbono = await Promise.all(
      contratas.map(async (c) => {
        const pagos = await db!.pagos.where("contrataId").equals(c.id).toArray();
        for (const p of pagos) pagosPorId.set(p.id, p);
        return {
          contrataId: c.id,
          tipo: c.tipo,
          monto: c.monto,
          abono: c.abono,
          numCuotas: c.numCuotas,
          pagos,
        };
      })
    );

    // Mismo `distribuirAbono` que corre en el servidor — se calcula igual
    // aquí para que lo que el cobrador ya vio en la vista previa (armada
    // con estos mismos datos) sea EXACTAMENTE lo que queda aplicado local,
    // sin sorpresas cuando sincronice.
    const resultado = distribuirAbono(paraAbono, monto);

    const ahora = new Date().toISOString();
    const contratasTocadas = new Set<string>();
    for (const a of resultado.aplicaciones) {
      const montoAbonadoPrevio = pagosPorId.get(a.pagoId)?.montoAbonado ?? 0;
      await db.pagos.update(a.pagoId, {
        montoAbonado: montoAbonadoPrevio + a.montoAplicado,
        ...(a.quedaPagada ? { pagado: true, fechaPago: ahora } : {}),
      });
      contratasTocadas.add(a.contrataId);
    }
    await Promise.all(
      Array.from(contratasTocadas).map((id) => db!.contratas.update(id, { _dirty: true }))
    );
    return;
  }

  if (type === "cita.crear") {
    // Igual que "contrata.crear": no existe todavía el id real (lo asigna
    // el servidor) — se espera al pull-sync tras confirmarse para que
    // aparezca en Ruta/perfil del cliente.
    return;
  }

  if (type === "cita.editar") {
    const { citaId, input } = payload as {
      citaId: string;
      input: {
        tipo?: "NUEVA" | "RENOVACION" | "SIN_DEFINIR";
        montoEstimado?: number;
        fechaEntrega?: string;
        contrataOrigenId?: string | null;
        notas?: string | null;
      };
    };
    await db.citas.update(citaId, {
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
      ...(input.montoEstimado !== undefined
        ? { montoEstimado: input.montoEstimado }
        : {}),
      ...(input.fechaEntrega !== undefined
        ? { fechaEntrega: input.fechaEntrega }
        : {}),
      ...(input.contrataOrigenId !== undefined
        ? { contrataOrigenId: input.contrataOrigenId }
        : {}),
      ...(input.notas !== undefined ? { notas: input.notas } : {}),
      _dirty: true,
    });
    return;
  }

  if (type === "cita.cancelar") {
    const { citaId } = payload as { citaId: string };
    await db.citas.update(citaId, { estado: "CANCELADA", _dirty: true });
    return;
  }

  if (type === "cita.entregar") {
    const { citaId, contrataCreadaId } = payload as {
      citaId: string;
      contrataCreadaId: string | null;
    };
    await db.citas.update(citaId, {
      estado: "ENTREGADA",
      contrataCreadaId: contrataCreadaId ?? null,
      _dirty: true,
    });
    return;
  }

  // A diferencia de "contrata.crear"/"cita.crear" —que esperan al servidor
  // porque él asigna el id— aquí el id se genera en el cliente y viaja en
  // el payload, así que la fila se puede insertar de una vez. Importa:
  // recién creado el cliente sin señal, hay que poder darle una contrata
  // en el momento, con el cliente enfrente.
  if (type === "cliente.crear") {
    const { id, ownerId, nombre, telefono, direccion, referencia, notas } =
      payload as {
        id: string;
        ownerId: string;
        nombre: string;
        telefono: string | null;
        direccion: string | null;
        referencia: string | null;
        notas: string | null;
      };
    await db.clientes.put({
      id,
      ownerId,
      nombre,
      telefono,
      direccion,
      referencia,
      notas,
      creadoEn: new Date().toISOString(),
      _dirty: true,
    });
    return;
  }

  if (type === "cliente.editar") {
    const { clienteId, input } = payload as {
      clienteId: string;
      input: Partial<{
        nombre: string;
        telefono: string | null;
        direccion: string | null;
        referencia: string | null;
        notas: string | null;
      }>;
    };
    await db.clientes.update(clienteId, { ...input, _dirty: true });
    return;
  }

  if (type === "cliente.eliminar") {
    const { clienteId } = payload as { clienteId: string };
    // Borrado lógico: `_deletedAt` lo esconde de las listas pero conserva la
    // fila hasta que el servidor confirme, para que `syncClientes` no la
    // reviva mientras la operación sigue en la cola.
    await db.clientes.update(clienteId, {
      _deletedAt: new Date().toISOString(),
      _dirty: true,
    });
    return;
  }

  if (type === "deudor.crear") {
    const { id, ownerId, nombre, deudaInicial, notas } = payload as {
      id: string;
      ownerId: string;
      nombre: string;
      deudaInicial: number;
      notas: string | null;
    };
    await db.deudores.put({
      id,
      ownerId,
      nombre,
      deudaInicial,
      notas,
      creadoEn: new Date().toISOString(),
      saldoActual: deudaInicial,
      numAbonos: 0,
      _dirty: true,
    });
    return;
  }

  if (type === "deudor.editar") {
    const { deudorId, input } = payload as {
      deudorId: string;
      input: Partial<{ nombre: string; deudaInicial: number; notas: string | null }>;
    };
    const deudor = await db.deudores.get(deudorId);
    if (!deudor) return;
    // Cambiar la deuda inicial mueve el saldo en la misma proporción: lo
    // abonado no cambia, pero lo que resta sí.
    const abonado = deudor.deudaInicial - deudor.saldoActual;
    await db.deudores.update(deudorId, {
      ...input,
      ...(input.deudaInicial !== undefined
        ? { saldoActual: Math.round((input.deudaInicial - abonado) * 100) / 100 }
        : {}),
      _dirty: true,
    });
    return;
  }
}
