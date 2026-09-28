/**
 * Estado observable del envío de la cola, para la UI (control de
 * sincronización). Vive en memoria: lo persistente — qué falta por subir —
 * ya está en IndexedDB (`writeQueue`) y se lee de ahí.
 *
 * Además programa los reintentos automáticos: con señal intermitente el
 * teléfono nunca deja de estar "online", así que no llega ningún evento de
 * conexión que vuelva a disparar el envío. Sin esto, lo capturado se
 * quedaba esperando hasta la siguiente captura.
 */

export type ResumenEnvio = {
  /** Operaciones que el servidor confirmó en esta pasada. */
  enviadas: number;
  /** Rechazadas (4xx) o apartadas por depender de una rechazada. */
  rechazadas: number;
  /** La pasada se cortó por red o 5xx: quedó algo pendiente de reintentar. */
  interrumpida: boolean;
  terminadoEn: number;
};

export type EstadoEnvio = {
  enviando: boolean;
  /** Epoch ms del próximo reintento automático, si hay uno programado. */
  proximoReintento: number | null;
  ultimoEnvio: ResumenEnvio | null;
};

let estado: EstadoEnvio = { enviando: false, proximoReintento: null, ultimoEnvio: null };
const oyentes = new Set<() => void>();

function publicar(cambios: Partial<EstadoEnvio>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((cb) => cb());
}

export function estadoEnvio(): EstadoEnvio {
  return estado;
}

export function suscribirseAEnvio(cb: () => void): () => void {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

export function marcarEnviando(): void {
  cancelarReintento();
  publicar({ enviando: true });
}

export function marcarTerminado(resumen: ResumenEnvio): void {
  publicar({ enviando: false, ultimoEnvio: resumen });
}

/* ── Reintentos con espera creciente ─────────────────────────────────── */

/** 15 s, 30 s, 1 min, 2 min y de ahí cada 5 min mientras siga fallando. */
const ESPERAS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

let temporizador: ReturnType<typeof setTimeout> | null = null;
let fallosSeguidos = 0;

export function programarReintento(reintentar: () => void): void {
  cancelarReintento();
  const espera = ESPERAS_MS[Math.min(fallosSeguidos, ESPERAS_MS.length - 1)];
  fallosSeguidos++;
  temporizador = setTimeout(() => {
    temporizador = null;
    publicar({ proximoReintento: null });
    reintentar();
  }, espera);
  publicar({ proximoReintento: Date.now() + espera });
}

/** El envío avanzó sin cortarse: la próxima falla vuelve a empezar desde 15 s. */
export function reiniciarEsperas(): void {
  fallosSeguidos = 0;
}

export function cancelarReintento(): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  if (estado.proximoReintento !== null) publicar({ proximoReintento: null });
}
