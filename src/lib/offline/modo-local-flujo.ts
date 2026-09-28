import { syncAll, syncDeudorDetalle } from "@/lib/offline/sync";
import { flushQueue } from "@/lib/offline/queue";
import { db } from "@/lib/offline/db";
import { descargarPantallas } from "@/lib/offline/pantallas-offline";
import { calidadConexion } from "@/lib/offline/conexion";
import { setModoLocal } from "@/lib/offline/modo-local";
import type { ResumenEnvio } from "@/lib/offline/cola/estado";

/**
 * Entrar y salir del modo local.
 *
 * Apagar la sincronización es algo que el cobrador hace A PROPÓSITO antes
 * de meterse a una zona sin señal: lo que importa es que el teléfono quede
 * listo — todo lo pendiente arriba y todo lo necesario abajo — y saber con
 * certeza si quedó listo o no, antes de perder la señal. Por eso la
 * descarga devuelve un reporte y NO activa el modo local por su cuenta: la
 * pantalla decide (entra directo si todo salió bien, pregunta si no).
 */

export type FaseDescarga = "subiendo" | "datos" | "deudores" | "pantallas";

export type ProgresoDescarga = { fase: FaseDescarga; hechas: number; total: number };

export type ReporteDescarga = {
  /** Quedó algo sin subir (sin contar lo apartado por conflicto). */
  pendientesSinSubir: number;
  datos: boolean;
  deudores: { hechos: number; total: number };
  pantallas: { hechas: number; total: number };
  cancelado: boolean;
};

export function descargaCompleta(r: ReporteDescarga): boolean {
  return (
    !r.cancelado &&
    r.pendientesSinSubir === 0 &&
    r.datos &&
    r.deudores.hechos === r.deudores.total &&
    r.pantallas.hechas === r.pantallas.total
  );
}

type RouterPrefetch = { prefetch: (href: string) => void };

/** Sube lo pendiente y baja absolutamente todo para trabajar sin red. */
export async function descargarParaModoLocal(
  ownerId: string,
  router: RouterPrefetch,
  opciones: { onProgreso: (p: ProgresoDescarga) => void; cancelado: () => boolean }
): Promise<ReporteDescarga> {
  const { onProgreso, cancelado } = opciones;
  const reporte: ReporteDescarga = {
    pendientesSinSubir: 0,
    datos: false,
    deudores: { hechos: 0, total: 0 },
    pantallas: { hechas: 0, total: 0 },
    cancelado: false,
  };

  onProgreso({ fase: "subiendo", hechas: 0, total: 1 });
  await subirTodo(ownerId);
  reporte.pendientesSinSubir = (await contarCola(ownerId)).pendientes;

  onProgreso({ fase: "datos", hechas: 0, total: 1 });
  reporte.datos = await syncAll(ownerId, { forzar: true });

  // Los abonos de cada deudor no vienen en el sync general.
  const deudores = await idsDeDeudores(ownerId);
  reporte.deudores.total = deudores.length;
  for (const deudorId of deudores) {
    if (cancelado()) break;
    onProgreso({ fase: "deudores", hechas: reporte.deudores.hechos, total: reporte.deudores.total });
    const ok = await syncDeudorDetalle(ownerId, deudorId).catch(() => false);
    if (ok) reporte.deudores.hechos++;
  }

  if (!cancelado()) {
    reporte.pantallas = await descargarPantallas(router, {
      onProgreso: ({ hechas, total }) => onProgreso({ fase: "pantallas", hechas, total }),
      cancelado,
    });
  }
  reporte.cancelado = cancelado();
  return reporte;
}

export function entrarAModoLocal(): void {
  setModoLocal(true);
}

export type ResultadoSincronizacion = {
  /** false: no había señal, no se intentó nada. */
  intentado: boolean;
  subidas: number;
  /** Nuevas operaciones apartadas por el servidor en esta sincronización. */
  porRevisar: number;
  /** Lo que quedó sin subir (la señal se cortó a medias). */
  sinSubir: number;
  /** null si no se intentó. */
  datos: boolean | null;
};

/**
 * Enciende la sincronización (si estaba en modo local) y sube + baja todo
 * de una vez. Devuelve el resumen para mostrar qué pasó con lo capturado.
 */
export async function sincronizarAhora(ownerId: string): Promise<ResultadoSincronizacion> {
  // Se cuenta antes y después en vez de usar el resumen del envío: al
  // encender, el envío automático (evento de conexión) puede adelantarse y
  // subir todo, y el propio quedaría en "0 subidos".
  const antes = await contarCola(ownerId);
  setModoLocal(false);
  if (calidadConexion() === "sin-red") {
    return { intentado: false, subidas: 0, porRevisar: 0, sinSubir: antes.pendientes, datos: null };
  }
  await subirTodo(ownerId);
  const datos = await syncAll(ownerId, { forzar: true });
  const despues = await contarCola(ownerId);
  const porRevisar = Math.max(0, despues.conflictos - antes.conflictos);
  return {
    intentado: true,
    subidas: Math.max(0, antes.pendientes - despues.pendientes - porRevisar),
    porRevisar,
    sinSubir: despues.pendientes,
    datos,
  };
}

/**
 * `flushQueue` devuelve null si ya hay un envío en curso (p. ej. el
 * automático al volver la señal). Aquí el usuario pidió explícitamente
 * subir y quiere el resultado, así que se espera a que ese envío termine
 * y se hace una pasada propia — sin esto el reporte decía "N sin subir"
 * mientras se estaban subiendo.
 */
async function subirTodo(ownerId: string): Promise<ResumenEnvio | null> {
  for (let intento = 0; intento < 60; intento++) {
    if (calidadConexion() === "sin-red") return null;
    const resumen = await flushQueue(ownerId);
    if (resumen) return resumen;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function idsDeDeudores(ownerId: string): Promise<string[]> {
  if (!db) return [];
  const deudores = await db.deudores.where("ownerId").equals(ownerId).toArray();
  return deudores.filter((d) => !d._deletedAt).map((d) => d.id);
}

/** Pendientes (se subirán solas) y apartadas (conflicto) en la cola. */
async function contarCola(ownerId: string): Promise<{ pendientes: number; conflictos: number }> {
  if (!db) return { pendientes: 0, conflictos: 0 };
  const ops = await db.writeQueue.where("ownerId").equals(ownerId).toArray();
  const conflictos = ops.filter((op) => op.status === "conflict").length;
  return { pendientes: ops.length - conflictos, conflictos };
}
