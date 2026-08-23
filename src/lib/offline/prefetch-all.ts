import type { IdsParaPrecarga } from "@/lib/offline/repo";
import { calidadConexion } from "@/lib/offline/conexion";

type RouterPrefetch = { prefetch: (href: string) => void };

/**
 * Techo duro de pantallas a precargar. Existe para que la precarga nunca
 * pueda volver a convertirse en el cuello de botella que era: con la
 * cartera real llegó a disparar ~2,235 peticiones seguidas, minutos de red
 * saturada compitiendo contra cada toque del usuario.
 */
const MAX_RUTAS = 60;

/** Solo lo que se abre de verdad en campo, no toda la subnavegación. */
function rutasDeContrata(id: string): string[] {
  // El detalle es donde se registran los abonos — es la pantalla que no
  // puede quedar en negro. Editar/renovar/recibo se abren con señal.
  return [`/contratas/${id}`];
}

function rutasDeCliente(id: string): string[] {
  // El perfil es a lo que se llega desde la Ruta; el estado de cuenta es lo
  // que se le enseña al cliente en la puerta.
  return [`/clientes/${id}`, `/clientes/${id}/estado-cuenta`];
}

function rutasDeDeudor(id: string): string[] {
  return [`/deudores/${id}`];
}

/**
 * Pantallas de "dar de alta algo nuevo": son fijas, pocas, y crear una
 * contrata ya funciona sin conexión (ver QueueOpType "contrata.crear"), así
 * que conviene tenerlas listas siempre.
 */
const RUTAS_CREACION = [
  "/ruta",
  "/clientes",
  "/contratas/nueva",
  "/clientes/nuevo",
  "/deudores/nuevo",
];

/**
 * Precarga, escalonada en el tiempo, las pantallas que se van a necesitar
 * sin señal: la ruta del día y las citas (ver `getIdsParaPrecarga`).
 *
 * Se corta sola si la conexión se degrada a media tanda — en campo la señal
 * cambia mientras uno camina, y seguir precargando sobre una red que acaba
 * de caer a 3G es justo lo que hacía que la app se sintiera trabada.
 */
export function precargarTodaLaApp(
  router: RouterPrefetch,
  ids: IdsParaPrecarga,
  opciones: { tandaTam?: number; pausaMs?: number } = {}
): () => void {
  const tandaTam = opciones.tandaTam ?? 4;
  const pausaMs = opciones.pausaMs ?? 1000;

  const rutas = [
    ...RUTAS_CREACION,
    ...ids.clientes.flatMap(rutasDeCliente),
    ...ids.contratas.flatMap(rutasDeContrata),
    ...ids.deudores.flatMap(rutasDeDeudor),
  ].slice(0, MAX_RUTAS);

  let cancelado = false;
  let i = 0;

  function tanda() {
    if (cancelado) return;
    // La señal pudo haberse degradado desde la tanda anterior.
    if (calidadConexion() !== "rapida") return;

    const fin = Math.min(i + tandaTam, rutas.length);
    for (; i < fin; i++) router.prefetch(rutas[i]);
    if (i < rutas.length) setTimeout(tanda, pausaMs);
  }

  tanda();

  return () => {
    cancelado = true;
  };
}
