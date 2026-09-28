import { PANTALLAS_OFFLINE } from "@/lib/rutas";
import { calidadConexion } from "@/lib/offline/conexion";

/**
 * Descarga de las pantallas para abrirlas sin señal.
 *
 * Como las pantallas de un registro son rutas estáticas (ver
 * src/lib/rutas.ts), no hay que bajar una por cliente o por contrata: son
 * ~26 rutas fijas y sirven para cualquier registro, incluso los creados
 * sin señal. Por cada una se baja:
 * - el documento HTML (lo que se sirve al abrir la app o recargar sin red),
 * - y el payload RSC del router (lo que usa la navegación dentro de la app).
 * Ambos quedan en el caché del service worker, que ignora la query al
 * guardarlos (ver src/sw.ts): una entrada por pantalla.
 */

type RouterPrefetch = { prefetch: (href: string) => void };

export type ProgresoPantallas = { hechas: number; total: number };

export async function descargarPantallas(
  router: RouterPrefetch,
  opciones: { onProgreso?: (p: ProgresoPantallas) => void; cancelado?: () => boolean } = {}
): Promise<ProgresoPantallas> {
  const total = PANTALLAS_OFFLINE.length;
  let hechas = 0;
  // Lo que se pide sin service worker controlando la página va directo a
  // la red y NO se guarda. Pasa justo después de instalar la app o de un
  // deploy: sin esta espera se daba por descargado algo que no lo estaba.
  if (!(await esperarServiceWorker())) return { hechas, total };
  for (const ruta of PANTALLAS_OFFLINE) {
    if (opciones.cancelado?.()) break;
    router.prefetch(ruta);
    const ok = await fetch(ruta, { credentials: "same-origin" })
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) hechas++;
    opciones.onProgreso?.({ hechas, total });
  }
  if (hechas === total) marcarDescargadas();
  return { hechas, total };
}

/** Espera (con tope) a que el service worker controle esta página. */
async function esperarServiceWorker(ms = 15_000): Promise<boolean> {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!sw) return false;
  if (sw.controller) return true;
  return new Promise((resolve) => {
    const listo = () => {
      clearTimeout(tope);
      resolve(true);
    };
    const tope = setTimeout(() => {
      sw.removeEventListener("controllerchange", listo);
      resolve(!!sw.controller);
    }, ms);
    sw.addEventListener("controllerchange", listo, { once: true });
  });
}

/* ── Descarga automática ─────────────────────────────────────────────── */

/**
 * Cada build nuevo cambia el HTML y los chunks de JS, así que lo guardado
 * de la versión anterior ya no sirve: se vuelve a bajar una vez por
 * versión (y como mucho una vez al día, por si algo quedó incompleto).
 */
const CLAVE = `kredired:pantallas:${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

function marcarDescargadas() {
  try {
    localStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // Sin almacenamiento: se reintentará la próxima vez.
  }
}

function yaDescargadas(): boolean {
  try {
    const v = Number(localStorage.getItem(CLAVE));
    return v > 0 && Date.now() - v < UN_DIA_MS;
  } catch {
    return false;
  }
}

let enCurso = false;

/**
 * Deja la app lista para abrirse sin señal sin que nadie tenga que pedirlo:
 * con buena señal, en segundo plano y una vez por versión. Así, aunque el
 * cobrador nunca apague la sincronización, perder la señal a media ruta no
 * lo deja con pantallas que no abren.
 */
export function descargarPantallasEnSegundoPlano(router: RouterPrefetch): void {
  if (enCurso || yaDescargadas() || calidadConexion() !== "rapida") return;
  enCurso = true;
  void descargarPantallas(router, {
    // Si la señal se degrada a medio camino, se deja para otra ocasión.
    cancelado: () => calidadConexion() !== "rapida",
  }).finally(() => {
    enCurso = false;
  });
}
