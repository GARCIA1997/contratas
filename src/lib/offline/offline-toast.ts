const EVENTO = "kredired:offline-nav-blocked";

/** Avisa que se bloqueó una navegación porque el dispositivo está sin conexión. */
export function emitOfflineBlocked() {
  window.dispatchEvent(new CustomEvent(EVENTO));
}

/** Escucha el aviso; devuelve la función de limpieza para el `useEffect`. */
export function onOfflineBlocked(callback: () => void): () => void {
  window.addEventListener(EVENTO, callback);
  return () => window.removeEventListener(EVENTO, callback);
}
