import * as Sentry from "@sentry/nextjs";
import { reportarError } from "@/lib/report-error";
import { db, type QueueOpType } from "@/lib/offline/db";
import { applyLocalEffect } from "@/lib/offline/effects";
import {
  calidadConexion,
  fetchConTimeout,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";
import {
  syncContratas,
  syncClientes,
  syncDeudores,
  syncDeudorDetalle,
  syncCitas,
} from "@/lib/offline/sync";
import {
  LIMITE_OPERACIONES_LOCALES,
  LimiteOfflineError,
} from "@/lib/offline/modo-local";

const ENDPOINTS: Record<
  QueueOpType,
  (payload: Record<string, unknown>) => { url: string; init: RequestInit }
> = {
  "contrata.pago.toggle": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/toggle`,
    init: { method: "POST" },
  }),
  "contrata.pago.abonar": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/abonar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: p.monto }),
    },
  }),
  "contrata.pago.revertir": (p) => ({
    url: `/api/contratas/${p.contrataId}/pagos/${p.numeroCuota}/abonar`,
    init: { method: "DELETE" },
  }),
  "contrata.marcarDeuda": (p) => ({
    url: `/api/contratas/${p.contrataId}/marcar-deuda`,
    init: { method: "POST" },
  }),
  "contrata.eliminar": (p) => ({
    url: `/api/contratas/${p.contrataId}`,
    init: { method: "DELETE" },
  }),
  "contrata.crear": (p) => ({
    url: `/api/contratas`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `_local` son las filas del efecto optimista, no van al servidor.
      body: JSON.stringify({ ...p, _local: undefined }),
    },
  }),
  "contrata.editar": (p) => ({
    url: `/api/contratas/${p.contrataId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "contrata.renovar": (p) => ({
    url: `/api/contratas/${p.contrataId}/renovar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "cliente.unificar": (p) => ({
    url: `/api/clientes/${p.clienteId}/unificar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contrataIds: p.contrataIds,
        ...(p.input as Record<string, unknown>),
      }),
    },
  }),
  "deudor.abonar": (p) => ({
    url: `/api/deudores/${p.deudorId}/abonos`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha: p.fecha, monto: p.monto, notas: p.notas }),
    },
  }),
  "cliente.cobrarVencidas": (p) => ({
    url: `/api/clientes/${p.clienteId}/cobrar-vencidas`,
    init: { method: "POST" },
  }),
  "cliente.abonarParcial": (p) => ({
    url: `/api/clientes/${p.clienteId}/abonar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: p.monto }),
    },
  }),
  "cita.crear": (p) => ({
    url: `/api/citas`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    },
  }),
  "cita.editar": (p) => ({
    url: `/api/citas/${p.citaId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "cita.cancelar": (p) => ({
    url: `/api/citas/${p.citaId}/cancelar`,
    init: { method: "POST" },
  }),
  "cita.entregar": (p) => ({
    url: `/api/citas/${p.citaId}/entregar`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrataCreadaId: p.contrataCreadaId ?? null }),
    },
  }),
  // El `id` viaja en el cuerpo: el registro nace con su id definitivo, así
  // una contrata creada offline puede referenciar a un cliente también
  // creado offline sin tener que remapear ids al sincronizar.
  "cliente.crear": (p) => ({
    url: `/api/clientes`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    },
  }),
  "cliente.editar": (p) => ({
    url: `/api/clientes/${p.clienteId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
  "cliente.eliminar": (p) => ({
    url: `/api/clientes/${p.clienteId}`,
    init: { method: "DELETE" },
  }),
  "deudor.crear": (p) => ({
    url: `/api/deudores`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    },
  }),
  "deudor.editar": (p) => ({
    url: `/api/deudores/${p.deudorId}`,
    init: {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.input),
    },
  }),
};

/**
 * Aplica el efecto local de inmediato (UI optimista) y encola la mutación
 * real. La idempotency key (mismo `id`) viaja en el header al vaciar la
 * cola, así un reintento tras perder la respuesta no duplica el pago.
 */
export async function enqueue(
  ownerId: string,
  type: QueueOpType,
  payload: Record<string, unknown>
): Promise<void> {
  const database = db;
  if (!database) return;
  // Techo de seguridad: ver LIMITE_OPERACIONES_LOCALES. Se revisa antes de
  // aplicar el efecto optimista para que la UI no muestre algo que nunca
  // se va a subir.
  const acumuladas = await database.writeQueue.where("ownerId").equals(ownerId).count();
  if (acumuladas >= LIMITE_OPERACIONES_LOCALES) throw new LimiteOfflineError();
  const id = crypto.randomUUID();
  await database.transaction(
    "rw",
    // Toda tabla que `applyLocalEffect` pueda tocar tiene que estar en el
    // alcance de la transacción: Dexie lanza si el efecto escribe en una
    // que no se declaró aquí, y el formulario se quedaba en «Guardando…»
    // para siempre porque el enqueue no estaba protegido.
    [
      database.writeQueue,
      database.clientes,
      database.contratas,
      database.pagos,
      database.deudores,
      database.abonosDeudor,
      database.citas,
    ],
    async () => {
      await database.writeQueue.add({
        id,
        ownerId,
        type,
        payload,
        createdAt: new Date().toISOString(),
        status: "pending",
        attempts: 0,
      });
      await applyLocalEffect(type, payload);
    }
  );
  void flushQueue(ownerId);
}

let flushing = false;
// Si un flushQueue llega mientras otro ya está corriendo, antes se perdía en
// silencio (con solo `if (flushing) return`) — bug reportado en campo: al
// marcar "Cobrado" en Ruta con un cliente de 2 contratas, marcarCobrado hace
// dos `await enqueue(...)` seguidos (uno por cuota); el primero dispara un
// flush que sigue en vuelo (esperando el fetch) cuando el segundo `enqueue`
// intenta el suyo, así que ese segundo flush no hacía nada — la cuota de la
// otra contrata se quedaba "pending" sin que nada la volviera a intentar
// hasta que algo más disparara un flush por casualidad (el recibo, armado
// del lado del cliente con las dos cuotas, mostraba éxito para ambas de
// todos modos). Ahora, en vez de perderlo, se anota qué owner lo pidió y se
// vuelve a correr apenas termine el flush que está en curso.
let reflushPendiente: string | null = null;

/** Vacía la cola en orden de creación contra las rutas API reales. */
export async function flushQueue(ownerId: string): Promise<void> {
  const database = db;
  // A diferencia del pull-sync, la cola SÍ se vacía en red lenta: son las
  // escrituras del usuario (cobros, abonos) y dejarlas esperando a una red
  // buena es peor que tardarse. Lo que las protege ahora es el techo de
  // espera de `fetchConTimeout` — antes, un fetch colgado en 3G detenía la
  // cola entera sin recuperarse.
  if (!database || calidadConexion() === "sin-red") {
    return;
  }
  if (flushing) {
    reflushPendiente = ownerId;
    return;
  }
  flushing = true;
  try {
    const pendientes = (
      await database.writeQueue.where("ownerId").equals(ownerId).toArray()
    )
      // "syncing" incluido a propósito: si el fetch de un intento anterior
      // nunca llegó a resolver (la app se cerró/perdió señal a media
      // petición en iOS, por ejemplo — reportado en campo: un elemento se
      // quedó en "syncing" con attempts:0 por más de una semana), el item
      // quedaba EXCLUIDO PARA SIEMPRE de este filtro, igual que pasaba antes
      // con "conflict". Es seguro reintentarlo: `flushing` ya impide que dos
      // flushQueue corran a la vez en esta misma sesión (así que un "syncing"
      // de una petición genuinamente en curso ahora mismo nunca llega aquí),
      // y el header Idempotency-Key protege contra aplicar la mutación dos
      // veces si la petición original sí había llegado al servidor.
      .filter(
        (op) =>
          op.status === "pending" ||
          op.status === "failed" ||
          op.status === "syncing"
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const op of pendientes) {
      await database.writeQueue.update(op.id, { status: "syncing" });
      try {
        const { url, init } = ENDPOINTS[op.type](op.payload);
        const res = await fetchConTimeout(
          url,
          {
            ...init,
            headers: { ...(init.headers ?? {}), "Idempotency-Key": op.id },
          },
          TIMEOUT_ESCRITURA_MS
        );
        if (!res.ok) {
          const status = res.status;
          const esConflicto = status >= 400 && status < 500;
          await database.writeQueue.update(op.id, {
            status: esConflicto ? "conflict" : "failed",
            attempts: op.attempts + 1,
            lastError: `HTTP ${status}`,
          });
          // Un "conflict" (4xx) queda excluido para siempre de los
          // reintentos automáticos (ver filtro de `pendientes` arriba) — sin
          // este reporte, quedaba atorado en silencio ("N por sincronizar"
          // permanente) sin ninguna pista de por qué (bug reportado en
          // campo). Se necesita el detalle real para diagnosticar la causa;
          // reintentarLoQueFalló() es la única vía para recuperarlo.
          if (esConflicto) {
            const detalle = await res.json().catch(() => null);
            Sentry.captureMessage("Operación offline en conflicto (4xx)", {
              level: "warning",
              extra: {
                opId: op.id,
                type: op.type,
                status,
                detalle,
                payload: op.payload,
              },
            });
            reportarError({
              origen: "queue",
              mensaje: `Operación "${op.type}" en conflicto (HTTP ${status})`,
              contexto: { opId: op.id, type: op.type, status, detalle, payload: op.payload },
            });
          }
          // Un 4xx es un rechazo definitivo de ESTA operación (el servidor
          // la validó y no aplica) — reintentar no cambia nada, así que se
          // sigue con las demás en vez de dejar atorado todo lo capturado
          // después (con el modo local puede ser un día entero de cobros).
          // Un 5xx o fallo de red sí detiene el drenado: es transitorio y
          // hay que respetar el orden.
          if (esConflicto) {
            await deshacerEntregaRechazada(ownerId, op.type, op.payload);
            continue;
          }
          break;
        }
        await database.writeQueue.delete(op.id);
        await limpiarDirtySiSinPendientes(op.payload);
        await reconciliarTrasExito(ownerId, op.type, op.payload);
      } catch (err) {
        await database.writeQueue.update(op.id, {
          status: "failed",
          attempts: op.attempts + 1,
          lastError: err instanceof Error ? err.message : "Error de red",
        });
        break;
      }
    }
  } finally {
    flushing = false;
    if (reflushPendiente) {
      const siguienteOwner = reflushPendiente;
      reflushPendiente = null;
      void flushQueue(siguienteOwner);
    }
  }
}

/**
 * Algunas operaciones tienen efectos del lado del servidor que el efecto
 * optimista simplificado no puede predecir por completo (p. ej. a qué
 * Deudor exacto se sumó el saldo al marcar una contrata como deuda). Tras
 * confirmarse, se refresca esa porción de la caché desde el servidor.
 */
async function reconciliarTrasExito(
  ownerId: string,
  type: QueueOpType,
  payload: Record<string, unknown>
) {
  if (type === "contrata.marcarDeuda") {
    await Promise.all([syncContratas(ownerId), syncDeudores(ownerId)]);
    return;
  }
  if (payload._local) {
    // Entrega hecha en modo local: la contrata nueva y las que se
    // liquidaron quedaron con _dirty para que ningún sync las pisara antes
    // de subir. Ya confirmadas, se liberan (salvo las que todavía tengan
    // otra operación en cola) y se traen del servidor.
    const filas = payload._local as { contrata: { id: string }; liquidar: { contrataId: string }[] };
    const ids = [
      filas.contrata.id,
      ...filas.liquidar.map((l) => l.contrataId),
      ...(payload.contrataId ? [payload.contrataId as string] : []),
    ];
    for (const id of ids) await limpiarDirtySiSinPendientes({ contrataId: id });
    await Promise.all([syncContratas(ownerId), syncClientes(ownerId)]);
    return;
  }
  if (type === "contrata.crear") {
    // No hay ninguna fila local que limpiar (la contrata y, si aplica, el
    // cliente son enteramente nuevos) — solo traer ambos del servidor.
    // syncClientes cubre el caso de "clienteNombre" (cliente nuevo creado
    // junto con la contrata); si se usó un clienteId existente, no hace
    // nada de más.
    await Promise.all([syncContratas(ownerId), syncClientes(ownerId)]);
    return;
  }
  if (type === "contrata.editar") {
    // El efecto optimista es deliberadamente incompleto (no recalcula el
    // calendario de cuotas) — el pull-sync trae el resultado real ya
    // confirmado por el servidor. limpiarDirtySiSinPendientes ya limpia el
    // _dirty de payload.contrataId, así que aquí no hace falta más.
    await syncContratas(ownerId);
    return;
  }
  if (type === "contrata.renovar" || type === "cliente.unificar") {
    // Igual que arriba, pero estas dos además tocan un ARRAY de contratas
    // (otrasIds / contrataIds) que limpiarDirtySiSinPendientes no conoce
    // (solo limpia _dirty de payload.contrataId, el campo singular). Sin
    // esto, esas contratas quedaban con _dirty:true para siempre y
    // syncContratas se rehusaba a pisarlas — la cuota que el servidor sí
    // liquidó (p. ej. al marcar "incluir otras" al renovar) nunca se veía
    // reflejada en la app.
    const database = db;
    if (database) {
      const ids =
        type === "contrata.renovar"
          ? [payload.contrataId as string, ...((payload.otrasIds as string[]) ?? [])]
          : (payload.contrataIds as string[]);
      await Promise.all(
        ids.map((id) => database.contratas.update(id, { _dirty: false }))
      );
    }
    await syncContratas(ownerId);
    return;
  }
  if (type === "deudor.abonar") {
    await syncDeudorDetalle(ownerId, payload.deudorId as string);
    return;
  }
  if (type === "cliente.cobrarVencidas" || type === "cliente.abonarParcial") {
    const database = db;
    if (!database) return;
    const clienteId = payload.clienteId as string;
    const contratas = await database.contratas
      .where("clienteId")
      .equals(clienteId)
      .toArray();
    await Promise.all(
      contratas.map((c) => database.contratas.update(c.id, { _dirty: false }))
    );
    await syncContratas(ownerId);
    return;
  }
  if (type === "cita.crear") {
    // La creada en modo local quedó con _dirty para que ningún sync la
    // borrara antes de subir; ya confirmada, se libera y se trae la real.
    const database = db;
    const citaId = payload.id as string | undefined;
    if (database && citaId && (await database.citas.get(citaId))) {
      await database.citas.update(citaId, { _dirty: false });
    }
    await syncCitas(ownerId);
    return;
  }
  if (type === "cliente.crear" || type === "cliente.editar") {
    // `limpiarDirtySiSinPendientes` solo conoce contrataId/deudorId, así que
    // el _dirty del cliente se limpia aquí: si no, `syncClientes` se
    // rehusaría a pisarlo y el registro quedaría congelado con los datos
    // locales para siempre.
    const database = db;
    const clienteId = (payload.id ?? payload.clienteId) as string | undefined;
    if (database && clienteId) {
      const existe = await database.clientes.get(clienteId);
      if (existe) await database.clientes.update(clienteId, { _dirty: false });
    }
    await syncClientes(ownerId);
    return;
  }

  if (type === "cliente.eliminar") {
    // Ya no existe en el servidor: se saca de la caché en vez de limpiar su
    // _dirty, que lo dejaría reaparecer en las listas.
    const database = db;
    if (database) await database.clientes.delete(payload.clienteId as string);
    await syncClientes(ownerId);
    return;
  }

  if (type === "deudor.crear" || type === "deudor.editar") {
    const database = db;
    const deudorId = (payload.id ?? payload.deudorId) as string | undefined;
    if (database && deudorId) {
      const existe = await database.deudores.get(deudorId);
      if (existe) await database.deudores.update(deudorId, { _dirty: false });
    }
    await syncDeudores(ownerId);
    return;
  }

  if (
    type === "cita.editar" ||
    type === "cita.cancelar" ||
    type === "cita.entregar"
  ) {
    // limpiarDirtySiSinPendientes no conoce el campo "citaId" (solo
    // contrataId/deudorId) — se limpia aquí a mano antes del resync, igual
    // que con renovar/unificar.
    const database = db;
    const citaId = payload.citaId as string;
    if (database) {
      const existe = await database.citas.get(citaId);
      if (existe) await database.citas.update(citaId, { _dirty: false });
    }
    await syncCitas(ownerId);
    return;
  }
}

/**
 * Si el servidor rechazó una entrega hecha en modo local, la contrata que se
 * creó en el teléfono no existe en ningún lado: se quita, se liberan las
 * contratas que se habían marcado como liquidadas y se vuelve a traer el
 * estado real. La operación queda en "conflicto" para que se vea y se
 * pueda revisar.
 */
async function deshacerEntregaRechazada(
  ownerId: string,
  type: QueueOpType,
  payload: Record<string, unknown>
) {
  const database = db;
  if (database && type === "cita.crear" && payload.id) {
    await database.citas.delete(payload.id as string);
    await syncCitas(ownerId).catch(() => undefined);
    return;
  }
  const filas = payload._local as
    | { contrata: { id: string }; liquidar: { contrataId: string }[] }
    | undefined;
  if (!database || !filas) return;
  const nuevaId = filas.contrata.id;
  const pagos = await database.pagos.where("contrataId").equals(nuevaId).primaryKeys();
  await database.pagos.bulkDelete(pagos);
  await database.contratas.delete(nuevaId);
  const ids = [
    ...filas.liquidar.map((l) => l.contrataId),
    ...(payload.contrataId ? [payload.contrataId as string] : []),
  ];
  for (const id of ids) await limpiarDirtySiSinPendientes({ contrataId: id });
  await syncContratas(ownerId).catch(() => undefined);
}

async function limpiarDirtySiSinPendientes(payload: Record<string, unknown>) {
  const database = db;
  if (!database) return;
  const contrataId = payload.contrataId as string | undefined;
  if (contrataId) {
    const quedan = await database.writeQueue
      .filter(
        (op) =>
          (op.payload as Record<string, unknown>).contrataId === contrataId &&
          op.status !== "conflict"
      )
      .count();
    if (quedan === 0) {
      const existe = await database.contratas.get(contrataId);
      if (existe) await database.contratas.update(contrataId, { _dirty: false });
    }
  }
  const deudorId = payload.deudorId as string | undefined;
  if (deudorId) {
    const quedan = await database.writeQueue
      .filter(
        (op) =>
          (op.payload as Record<string, unknown>).deudorId === deudorId &&
          op.status !== "conflict"
      )
      .count();
    if (quedan === 0) {
      const existe = await database.deudores.get(deudorId);
      if (existe) await database.deudores.update(deudorId, { _dirty: false });
    }
  }
}

/** Cuántas operaciones más caben antes del límite de seguridad. */
export async function espacioEnCola(ownerId: string): Promise<number> {
  return Math.max(0, LIMITE_OPERACIONES_LOCALES - (await pendingCount(ownerId)));
}

export async function pendingCount(ownerId: string): Promise<number> {
  const database = db;
  if (!database) return 0;
  return database.writeQueue.where("ownerId").equals(ownerId).count();
}

/**
 * Operaciones "en conflicto" (4xx): flushQueue las excluye para siempre de
 * los reintentos automáticos, así que sin este contador quedan atoradas en
 * silencio, contando como "N por sincronizar" indefinidamente sin que nada
 * distinga que necesitan atención manual (bug reportado en campo).
 */
export async function conflictCount(ownerId: string): Promise<number> {
  const database = db;
  if (!database) return 0;
  return database.writeQueue
    .where("ownerId")
    .equals(ownerId)
    .filter((op) => op.status === "conflict")
    .count();
}

/**
 * Reintenta a mano lo que quedó atorado: operaciones en "conflict" (un 4xx
 * que se excluye para siempre de flushQueue) y en "syncing" (una petición
 * anterior que nunca llegó a resolver — mismo problema, sin este reset
 * manual seguían atoradas aunque flushQueue ya las reintenta solo en la
 * siguiente vez que corre). Regresa ambas a "pending" y dispara un flush.
 * Solo tiene sentido si la causa ya se resolvió (p. ej. la contrata
 * referenciada terminó de sincronizarse mientras tanto); si el problema
 * persiste, vuelve a quedar atorada tras el intento.
 */
export async function reintentarConflictos(ownerId: string): Promise<void> {
  const database = db;
  if (!database) return;
  const atoradas = await database.writeQueue
    .where("ownerId")
    .equals(ownerId)
    .filter((op) => op.status === "conflict" || op.status === "syncing")
    .toArray();
  await Promise.all(
    atoradas.map((op) => database.writeQueue.update(op.id, { status: "pending" }))
  );
  await flushQueue(ownerId);
}

export type DiagnosticoCola = {
  total: number;
  porEstado: Record<string, number>;
  items: Array<{
    id: string;
    type: QueueOpType;
    status: string;
    attempts: number;
    lastError?: string | null;
    createdAt: string;
  }>;
};

/**
 * Snapshot de la cola local para el botón de "Revisar y reparar
 * sincronización" en Config — pensado para diagnosticar en campo el caso de
 * "sigue apareciendo 1 sin sincronizar" sin necesidad de inspeccionar
 * IndexedDB a mano desde devtools.
 */
export async function diagnosticarCola(ownerId: string): Promise<DiagnosticoCola> {
  const database = db;
  if (!database) return { total: 0, porEstado: {}, items: [] };
  const items = await database.writeQueue.where("ownerId").equals(ownerId).toArray();
  const porEstado: Record<string, number> = {};
  for (const it of items) porEstado[it.status] = (porEstado[it.status] ?? 0) + 1;
  return {
    total: items.length,
    porEstado,
    items: items.map((it) => ({
      id: it.id,
      type: it.type,
      status: it.status,
      attempts: it.attempts,
      lastError: it.lastError,
      createdAt: it.createdAt,
    })),
  };
}
