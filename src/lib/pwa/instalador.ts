/**
 * Estado de instalación de la PWA, en un solo lugar.
 *
 * El problema que resuelve: `beforeinstallprompt` es un evento del `window`
 * que dispara el navegador una sola vez por carga de página, ANTES de que
 * exista ningún componente montado para escucharlo — si cada componente que
 * lo necesita (el aviso automático en Android, el botón de respaldo en
 * Configuración) pusiera su propio listener, el que se monte después de que
 * el evento ya disparó se quedaría sin saber que la instalación es posible.
 * Aquí se captura una sola vez, a nivel de módulo, y se guarda para que
 * cualquier componente que se monte después (incluso mucho después) pueda
 * consultarlo.
 *
 * Mismo patrón que `offline/conexion.ts`: un estado leído con una función y
 * un `suscribirse` para reaccionar a cambios — sin Context ni Provider.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type ResultadoInstalar = "aceptado" | "rechazado" | "no-disponible";

let eventoDiferido: BeforeInstallPromptEvent | null = null;
let instalada = false;
const listeners = new Set<() => void>();

function notificar() {
  listeners.forEach((cb) => cb());
}

function enModoStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari no dispara beforeinstallprompt, pero sí expone esta bandera
    // cuando la app ya se abrió desde el icono de pantalla de inicio.
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
  );
}

if (typeof window !== "undefined") {
  instalada = enModoStandalone();

  window.addEventListener("beforeinstallprompt", (e) => {
    // Sin esto el navegador muestra su propio mini-banner nativo de una vez
    // — queremos decidir nosotros cuándo y cómo se ve el aviso.
    e.preventDefault();
    eventoDiferido = e as BeforeInstallPromptEvent;
    notificar();
  });

  window.addEventListener("appinstalled", () => {
    instalada = true;
    eventoDiferido = null;
    notificar();
  });
}

export type EstadoInstalador = {
  /** El navegador ya ofreció el evento nativo — se puede llamar `instalarApp()`. */
  instalable: boolean;
  /** Ya corre como app instalada (standalone) — nada que ofrecer. */
  instalada: boolean;
};

export function estadoInstalador(): EstadoInstalador {
  return { instalable: eventoDiferido !== null, instalada };
}

export function suscribirseAInstalador(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Dispara el diálogo nativo de instalación. El evento del navegador solo se
 * puede usar una vez — se descarta de inmediato para que un segundo toque
 * (o un segundo componente) no intente reusarlo y falle en silencio.
 */
export async function instalarApp(): Promise<ResultadoInstalar> {
  if (!eventoDiferido) return "no-disponible";
  const evento = eventoDiferido;
  eventoDiferido = null;
  notificar();
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  return outcome === "accepted" ? "aceptado" : "rechazado";
}

/**
 * Detección por user-agent — suficiente aquí porque solo se usa para decidir
 * si vale la pena OFRECER instalar (un falso negativo simplemente no
 * muestra el aviso automático; el botón de Configuración sigue funcionando
 * en cualquier navegador que sí dispare `beforeinstallprompt`).
 */
export function esAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}
