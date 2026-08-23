import { db } from "@/lib/offline/db";
import { calidadConexion, fetchConTimeout } from "@/lib/offline/conexion";

type ContrataApi = {
  id: string;
  ownerId: string;
  clienteId: string;
  tipo: "SEMANAL" | "QUINCENAL" | "MENSUAL";
  monto: number;
  abono: number;
  fechaInicio: string;
  numCuotas: number;
  mes: string;
  notas: string | null;
  convertidaADeuda: boolean;
  deudorId: string | null;
  creadoEn: string;
  cliente: {
    id: string;
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    referencia: string | null;
    notas: string | null;
    creadoEn: string;
  };
  pagos: {
    id: string;
    numeroCuota: number;
    fechaProgramada: string;
    fechaPago: string | null;
    pagado: boolean;
    montoAbonado: number;
  }[];
};

/**
 * Pull-sync: trae el snapshot de contratas del servidor y hace upsert en
 * Dexie, sin pisar filas locales con escrituras aún no confirmadas
 * (`_dirty`). El servidor sigue siendo la fuente de verdad final — esto
 * solo alimenta la caché de lectura offline.
 */
export async function syncContratas(ownerId: string): Promise<void> {
  const database = db;
  if (!database) return;
  const res = await fetchConTimeout("/api/contratas", { cache: "no-store" });
  if (!res.ok) return;
  const contratas: ContrataApi[] = await res.json();

  await database.transaction(
    "rw",
    [database.contratas, database.pagos, database.clientes],
    async () => {
    // Igual que en clientes: lo que queda en este set tras recorrer la
    // respuesta fue eliminado en el servidor y hay que sacarlo de la caché.
    // Los `_dirty` se excluyen (incluye las borradas offline, que siguen
    // existiendo en el servidor hasta que la cola se vacíe).
    const eliminadasEnServidor = new Set(
      (await database.contratas.where("ownerId").equals(ownerId).toArray())
        .filter((c) => !c._dirty)
        .map((c) => c.id)
    );

    for (const c of contratas) {
      eliminadasEnServidor.delete(c.id);
      const local = await database.contratas.get(c.id);
      if (local?._dirty) continue; // hay una escritura local sin confirmar, no pisar

      await database.contratas.put({
        id: c.id,
        ownerId: c.ownerId,
        clienteId: c.clienteId,
        clienteNombre: c.cliente.nombre,
        clienteTelefono: c.cliente.telefono,
        tipo: c.tipo,
        monto: c.monto,
        abono: c.abono,
        fechaInicio: c.fechaInicio,
        numCuotas: c.numCuotas,
        mes: c.mes,
        notas: c.notas,
        convertidaADeuda: c.convertidaADeuda,
        deudorId: c.deudorId,
        creadoEn: c.creadoEn,
      });

      await database.clientes.put({
        id: c.cliente.id,
        ownerId,
        nombre: c.cliente.nombre,
        telefono: c.cliente.telefono,
        direccion: c.cliente.direccion,
        referencia: c.cliente.referencia,
        notas: c.cliente.notas,
        creadoEn: c.cliente.creadoEn,
      });

      const existentesIds = new Set(
        (await database.pagos.where("contrataId").equals(c.id).toArray()).map(
          (p) => p.id
        )
      );
      for (const p of c.pagos) {
        existentesIds.delete(p.id);
        await database.pagos.put({
          id: p.id,
          contrataId: c.id,
          ownerId,
          numeroCuota: p.numeroCuota,
          fechaProgramada: p.fechaProgramada,
          fechaPago: p.fechaPago,
          pagado: p.pagado,
          montoAbonado: p.montoAbonado,
        });
      }
      // Pagos que ya no vienen del servidor (recalendarizados) se eliminan.
      if (existentesIds.size > 0) {
        await database.pagos.bulkDelete(Array.from(existentesIds));
      }
    }

    // Contratas eliminadas en el servidor: se quitan junto con sus pagos
    // para no dejar huérfanos en la caché.
    if (eliminadasEnServidor.size > 0) {
      const ids = Array.from(eliminadasEnServidor);
      const pagosHuerfanos = await database.pagos
        .where("contrataId")
        .anyOf(ids)
        .primaryKeys();
      await database.pagos.bulkDelete(pagosHuerfanos);
      await database.contratas.bulkDelete(ids);
    }
  });
}

type ClienteApi = {
  id: string;
  ownerId: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
  notas: string | null;
  creadoEn: string;
};

/** Trae el catálogo completo de clientes (incluye los que aún no tienen contrata). */
export async function syncClientes(ownerId: string): Promise<void> {
  const database = db;
  if (!database) return;
  const res = await fetchConTimeout("/api/clientes", { cache: "no-store" });
  if (!res.ok) return;
  const clientes: ClienteApi[] = await res.json();

  await database.transaction("rw", [database.clientes], async () => {
    // Se parte del set local y se va descartando lo que sí vino del
    // servidor; lo que sobra fue eliminado allá. Los `_dirty` se excluyen
    // del barrido: tienen una escritura local sin confirmar y el servidor
    // todavía no los refleja.
    const eliminadosEnServidor = new Set(
      (await database.clientes.where("ownerId").equals(ownerId).toArray())
        .filter((c) => !c._dirty)
        .map((c) => c.id)
    );

    for (const c of clientes) {
      eliminadosEnServidor.delete(c.id);
      const local = await database.clientes.get(c.id);
      if (local?._dirty) continue;
      await database.clientes.put({
        id: c.id,
        ownerId,
        nombre: c.nombre,
        telefono: c.telefono,
        direccion: c.direccion,
        referencia: c.referencia,
        notas: c.notas,
        creadoEn: c.creadoEn,
      });
    }

    if (eliminadosEnServidor.size > 0) {
      await database.clientes.bulkDelete(Array.from(eliminadosEnServidor));
    }
  });
}

type DeudorResumenApi = {
  id: string;
  nombre: string;
  deudaInicial: number;
  totalAbonado: number;
  saldoActual: number;
  numAbonos: number;
};

export async function syncDeudores(ownerId: string): Promise<void> {
  const database = db;
  if (!database) return;
  const res = await fetchConTimeout("/api/deudores", { cache: "no-store" });
  if (!res.ok) return;
  const data: { deudores: DeudorResumenApi[] } = await res.json();

  await database.transaction("rw", [database.deudores], async () => {
    const existentesIds = new Set(
      (await database.deudores.where("ownerId").equals(ownerId).toArray()).map(
        (d) => d.id
      )
    );
    for (const d of data.deudores) {
      existentesIds.delete(d.id);
      const local = await database.deudores.get(d.id);
      if (local?._dirty) continue;
      await database.deudores.put({
        id: d.id,
        ownerId,
        nombre: d.nombre,
        deudaInicial: d.deudaInicial,
        notas: local?.notas ?? null,
        creadoEn: local?.creadoEn ?? new Date().toISOString(),
        saldoActual: d.saldoActual,
        numAbonos: d.numAbonos,
      });
    }
    if (existentesIds.size > 0) {
      await database.deudores.bulkDelete(Array.from(existentesIds));
    }
  });
}

type DeudorDetalleApi = {
  id: string;
  ownerId: string;
  nombre: string;
  deudaInicial: number;
  notas: string | null;
  creadoEn: string;
  abonos: {
    id: string;
    fecha: string;
    monto: number;
    restante: number;
    notas: string | null;
  }[];
};

/** Sincroniza un deudor puntual con su historial completo de abonos (detalle). */
export async function syncDeudorDetalle(
  ownerId: string,
  deudorId: string
): Promise<void> {
  const database = db;
  if (!database) return;
  const res = await fetchConTimeout(`/api/deudores/${deudorId}`, { cache: "no-store" });
  if (!res.ok) return;
  const d: DeudorDetalleApi = await res.json();
  const totalAbonado = Math.round(
    d.abonos.reduce((s, a) => s + a.monto, 0) * 100
  ) / 100;

  await database.transaction(
    "rw",
    [database.deudores, database.abonosDeudor],
    async () => {
      await database.deudores.put({
        id: d.id,
        ownerId,
        nombre: d.nombre,
        deudaInicial: d.deudaInicial,
        notas: d.notas,
        creadoEn: d.creadoEn,
        saldoActual: Math.round((d.deudaInicial - totalAbonado) * 100) / 100,
        numAbonos: d.abonos.length,
      });
      const existentesIds = new Set(
        (
          await database.abonosDeudor.where("deudorId").equals(d.id).toArray()
        ).map((a) => a.id)
      );
      for (const a of d.abonos) {
        existentesIds.delete(a.id);
        await database.abonosDeudor.put({
          id: a.id,
          deudorId: d.id,
          ownerId,
          fecha: a.fecha,
          monto: a.monto,
          restante: a.restante,
          notas: a.notas,
        });
      }
      if (existentesIds.size > 0) {
        await database.abonosDeudor.bulkDelete(Array.from(existentesIds));
      }
    }
  );
}

type ConfiguracionApi = {
  nombreApp: string;
  tasaSemanal: number;
  tasaQuincenal: number;
  tasaMensual: number;
  cuotasPorDefecto: number;
  maxCuotas: number;
  modoFechasQuincenal: string;
  diaCobroSemanal: number;
  colorPrimario: string;
  logoUrl: string | null;
};

export async function syncConfiguracion(ownerId: string): Promise<void> {
  const database = db;
  if (!database) return;
  const res = await fetchConTimeout("/api/configuracion", { cache: "no-store" });
  if (!res.ok) return;
  const cfg: ConfiguracionApi = await res.json();
  await database.configuracion.put({ ownerId, ...cfg });
}

type CitaApi = {
  id: string;
  ownerId: string;
  clienteId: string;
  contrataOrigenId: string | null;
  contrataCreadaId: string | null;
  tipo: "NUEVA" | "RENOVACION" | "SIN_DEFINIR";
  montoEstimado: number;
  fechaEntrega: string;
  notas: string | null;
  estado: "PENDIENTE" | "ENTREGADA" | "CANCELADA";
  creadoEn: string;
  cliente: { nombre: string; telefono: string | null };
};

/** Trae las citas agendadas (todas, no solo las del día) y hace upsert en Dexie. */
export async function syncCitas(ownerId: string): Promise<void> {
  const database = db;
  if (!database) return;
  const res = await fetchConTimeout("/api/citas", { cache: "no-store" });
  if (!res.ok) return;
  const citas: CitaApi[] = await res.json();

  await database.transaction("rw", [database.citas], async () => {
    const eliminadasEnServidor = new Set(
      (await database.citas.where("ownerId").equals(ownerId).toArray())
        .filter((c) => !c._dirty)
        .map((c) => c.id)
    );

    for (const c of citas) {
      eliminadasEnServidor.delete(c.id);
      const local = await database.citas.get(c.id);
      if (local?._dirty) continue;

      await database.citas.put({
        id: c.id,
        ownerId: c.ownerId,
        clienteId: c.clienteId,
        clienteNombre: c.cliente.nombre,
        clienteTelefono: c.cliente.telefono,
        contrataOrigenId: c.contrataOrigenId,
        contrataCreadaId: c.contrataCreadaId,
        tipo: c.tipo,
        montoEstimado: c.montoEstimado,
        fechaEntrega: c.fechaEntrega,
        notas: c.notas,
        estado: c.estado,
        creadoEn: c.creadoEn,
      });
    }

    if (eliminadasEnServidor.size > 0) {
      await database.citas.bulkDelete(Array.from(eliminadasEnServidor));
    }
  });
}

async function ejecutarSync(ownerId: string, enSerie: boolean): Promise<void> {
  const tareas = [
    () => syncContratas(ownerId),
    () => syncClientes(ownerId),
    () => syncDeudores(ownerId),
    () => syncConfiguracion(ownerId),
    () => syncCitas(ownerId),
  ];
  try {
    if (enSerie) {
      // En red lenta, cinco peticiones a la vez solo se estorban entre sí:
      // compiten por un ancho de banda mínimo y todas tardan más. En serie
      // cada una avanza a su ritmo y la app puede usar lo que ya llegó.
      for (const tarea of tareas) await tarea();
    } else {
      await Promise.all(tareas.map((t) => t()));
    }
  } catch {
    // Sin red, timeout o error del servidor: la app sigue funcionando desde
    // la caché local, que es justamente para lo que existe.
  }
}

/** Cola de sincronizaciones: nunca corren dos a la vez, pero tampoco se pierde ninguna. */
let cadena: Promise<void> = Promise.resolve();

/**
 * Sincroniza todas las entidades cubiertas por la capa offline.
 *
 * Si ya hay una corriendo, esta se encola detrás en vez de descartarse.
 * Descartarla (como se hacía antes con un flag booleano) rompía a quien
 * pide un sync explícito y espera ver el resultado: el botón «Recargar
 * datos» o el sync que corre justo después de eliminar algo se volvían
 * silenciosamente un no-op si coincidían con el sync del montaje, dejando
 * en pantalla datos que el servidor ya no tiene.
 */
export function syncAll(
  ownerId: string,
  opciones: { forzar?: boolean } = {}
): Promise<void> {
  const calidad = calidadConexion();
  if (calidad === "sin-red") return Promise.resolve();
  // En red lenta el sync automático no corre solo: son cinco peticiones y
  // cerca de 1 MB, suficiente para dejar la app inservible varios minutos
  // en 3G. El botón «Recargar datos» pasa `forzar` y sí lo ejecuta, porque
  // ahí el usuario decidió esperar a cambio de datos frescos.
  if (calidad === "lenta" && !opciones.forzar) return Promise.resolve();

  cadena = cadena
    .catch(() => {})
    .then(() => ejecutarSync(ownerId, calidad === "lenta"));
  return cadena;
}
