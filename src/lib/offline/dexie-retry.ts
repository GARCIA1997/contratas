import { db } from "@/lib/offline/db";

/**
 * Fallas de IndexedDB en WebKit (Safari / iPhone).
 *
 * Reportadas en producción vía ErrorLog, todas desde iPhone:
 *  - "Attempt to iterate a cursor that doesn't exist"
 *  - "Attempt to get all index records from database without an in-progress transaction"
 *  - "Attempt to get count from database without an in-progress transaction"
 *  - "An internal error was encountered in the Indexed Database server"
 *
 * Es un bug conocido de WebKit: cuando la app pasa un rato en segundo plano,
 * iOS suspende o mata el proceso que atiende IndexedDB y la conexión que
 * tiene abierta la página queda muerta — no se cierra (Dexie no se entera),
 * simplemente toda operación siguiente falla con alguno de esos mensajes.
 * Reintentar sobre la misma conexión no sirve: hay que cerrarla y volver a
 * abrirla. Antes solo se reintentaba el caso del cursor y sin reabrir, así
 * que las demás variantes llegaban hasta la pantalla o quedaban como
 * promesas rechazadas sin manejar.
 */
const PATRONES = [
  "cursor that doesn't exist",
  "without an in-progress transaction",
  "Indexed Database server",
  "Connection to Indexed Database server lost",
  "Database has been closed",
  "DatabaseClosedError",
];

export function esFallaIndexedDB(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: unknown; name?: unknown; inner?: unknown };
  const texto = `${String(e.name ?? "")} ${String(e.message ?? "")}`;
  if (PATRONES.some((p) => texto.includes(p))) return true;
  // Dexie envuelve el error nativo en `inner`.
  return e.inner ? esFallaIndexedDB(e.inner) : false;
}

let reapertura: Promise<void> | null = null;

/**
 * Cierra y vuelve a abrir la conexión. Si varias consultas fallan a la vez
 * (lo normal al volver del segundo plano: cada pantalla tiene varias), todas
 * esperan la MISMA reapertura en vez de abrir y cerrar en cascada.
 */
export function reabrirIndexedDB(): Promise<void> {
  const database = db;
  if (!database) return Promise.resolve();
  if (!reapertura) {
    reapertura = (async () => {
      try {
        database.close();
      } catch {
        // Ya estaba cerrada o rota: da igual, se abre de nuevo.
      }
      await database.open();
    })().finally(() => {
      reapertura = null;
    });
  }
  return reapertura;
}

/**
 * Ejecuta una operación de Dexie y, si falla por el bug de WebKit, reabre la
 * conexión y la reintenta. Cualquier otro error se propaga tal cual.
 */
export async function conIndexedDBSano<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!esFallaIndexedDB(err) || i === intentos - 1) throw err;
      // El primer reintento es rápido (el caso del cursor suele ser
      // momentáneo); a partir del segundo se asume conexión muerta.
      if (i === 0) await new Promise((r) => setTimeout(r, 50));
      else await reabrirIndexedDB().catch(() => undefined);
    }
  }
  /* istanbul ignore next: inalcanzable, el loop siempre retorna o lanza */
  throw new Error("unreachable");
}

/** Nombre anterior, conservado para no romper llamadas existentes. */
export const reintentarSiCursorInvalido = conIndexedDBSano;

/**
 * Prueba la conexión con una lectura mínima y, si está muerta, la reabre.
 * Se llama al volver la app al frente (cuando iOS suele haberla matado),
 * ANTES de sincronizar o de que las pantallas vuelvan a consultar.
 */
export async function asegurarIndexedDB(): Promise<void> {
  const database = db;
  if (!database) return;
  try {
    await Promise.race([
      database.meta.count(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("Indexed Database server: sin respuesta")), 2000)
      ),
    ]);
  } catch {
    await reabrirIndexedDB().catch(() => undefined);
  }
}

/** Vigila el regreso al frente. Devuelve la función para dejar de vigilar. */
export function vigilarIndexedDB(): () => void {
  if (typeof window === "undefined" || !db) return () => {};
  const revisar = () => {
    if (document.visibilityState === "visible") void asegurarIndexedDB();
  };
  document.addEventListener("visibilitychange", revisar);
  window.addEventListener("pageshow", revisar);
  return () => {
    document.removeEventListener("visibilitychange", revisar);
    window.removeEventListener("pageshow", revisar);
  };
}
