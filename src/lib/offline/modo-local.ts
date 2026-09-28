/**
 * «Modo local»: el usuario apaga la sincronización a propósito (switch del
 * encabezado) y la app trabaja solo contra IndexedDB — todo lo que haga se
 * encola y nada sale a la red hasta que vuelva a encender el switch.
 *
 * Vive en localStorage (por dispositivo, sobrevive recargas) y se consulta
 * desde `calidadConexion()`, así que cola, pull-sync, precargas y
 * formularios lo tratan exactamente igual que "sin señal" sin tener que
 * conocerlo cada uno.
 */

const CLAVE = "kredired:modo-local";
const EVENTO = "kredired:modo-local-cambio";

/**
 * Máximo de operaciones que se pueden acumular sin sincronizar. Cada una se
 * valida contra el servidor recién al subir, con el estado de ESE momento:
 * mientras más se acumulan, más probable es que alguna ya no aplique (una
 * cuota que otro dispositivo cobró, un saldo que cambió) y más difícil es
 * revisar qué pasó. 100 alcanza para un día de ruta completo.
 */
export const LIMITE_OPERACIONES_LOCALES = 100;
/** A partir de aquí se avisa que conviene sincronizar pronto. */
export const AVISO_OPERACIONES_LOCALES = 80;

export class LimiteOfflineError extends Error {
  constructor() {
    super(
      `Llegaste al límite de ${LIMITE_OPERACIONES_LOCALES} movimientos sin sincronizar. ` +
        "Enciende la sincronización con señal para poder seguir."
    );
    this.name = "LimiteOfflineError";
  }
}

export function modoLocalActivo(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(CLAVE) !== null;
  } catch {
    return false;
  }
}

/** Desde cuándo está activo (null si no lo está). */
export function modoLocalDesde(): Date | null {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(CLAVE) : null;
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return null;
  }
}

export function setModoLocal(activo: boolean): void {
  try {
    if (activo) localStorage.setItem(CLAVE, new Date().toISOString());
    else localStorage.removeItem(CLAVE);
  } catch {
    // Almacenamiento bloqueado: el switch simplemente no persiste.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

export function suscribirseAModoLocal(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO, cb);
  // Otra pestaña cambió el switch.
  const onStorage = (e: StorageEvent) => {
    if (e.key === CLAVE) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", onStorage);
  };
}
