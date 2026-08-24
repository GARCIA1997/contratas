import type { IdsParaPrecarga } from "@/lib/offline/repo";

type RouterPrefetch = { prefetch: (href: string) => void };

/** Cuándo se preparó por última vez, para poder decírselo al usuario. */
const CLAVE_ULTIMA = "kredired:preparado-en";

export function ultimaPreparacion(): Date | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(CLAVE_ULTIMA);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function marcarPreparado() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CLAVE_ULTIMA, new Date().toISOString());
}

/**
 * Todas las subpantallas de cada registro. A diferencia de la precarga
 * automática (que solo cubre la ruta del día), aquí sí se baja TODO: es una
 * acción deliberada, hecha con wifi antes de salir, y el objetivo es que en
 * campo no falte ninguna pantalla.
 */
function rutasDeContrata(id: string) {
  return [
    `/contratas/${id}`,
    `/contratas/${id}/editar`,
    `/contratas/${id}/renovar`,
    `/contratas/${id}/recibo`,
  ];
}

function rutasDeCliente(id: string) {
  return [
    `/clientes/${id}`,
    `/clientes/${id}/editar`,
    `/clientes/${id}/historial`,
    `/clientes/${id}/estado-cuenta`,
    `/clientes/${id}/unificar`,
  ];
}

function rutasDeDeudor(id: string) {
  return [`/deudores/${id}`, `/deudores/${id}/editar`, `/deudores/${id}/estado-cuenta`];
}

/** Pantallas fijas: listas, altas y las herramientas que se usan en campo. */
const RUTAS_FIJAS = [
  "/",
  "/ruta",
  "/clientes",
  "/contratas",
  "/deudores",
  "/calculadora",
  "/config",
  "/clientes/nuevo",
  "/deudores/nuevo",
  "/citas/nueva",
  "/contratas/nueva",
  "/contratas/nueva?tipo=SEMANAL",
  "/contratas/nueva?tipo=QUINCENAL",
  "/contratas/nueva?tipo=MENSUAL",
];

export function rutasDeTodaLaApp(ids: IdsParaPrecarga): string[] {
  return [
    ...RUTAS_FIJAS,
    ...ids.clientes.flatMap(rutasDeCliente),
    ...ids.contratas.flatMap(rutasDeContrata),
    ...ids.deudores.flatMap(rutasDeDeudor),
  ];
}

export type ProgresoPreparacion = {
  hechas: number;
  total: number;
};

/**
 * Descarga toda la app para usarla después sin señal.
 *
 * A diferencia de la precarga automática del dashboard —que es ligera, se
 * abstiene en red lenta y solo cubre la ruta del día— esta es deliberada:
 * la dispara el usuario desde el botón «Preparar para trabajar sin señal»,
 * normalmente con wifi antes de salir a campo. Por eso aquí sí se baja
 * todo, sin tope.
 *
 * Va en tandas con una pausa entre cada una para no saturar el VPS (1 vCPU)
 * ni la conexión de golpe.
 */
export async function prepararTodaLaApp(
  router: RouterPrefetch,
  ids: IdsParaPrecarga,
  opciones: {
    onProgreso?: (p: ProgresoPreparacion) => void;
    cancelado?: () => boolean;
    tandaTam?: number;
    pausaMs?: number;
  } = {}
): Promise<ProgresoPreparacion> {
  const tandaTam = opciones.tandaTam ?? 6;
  const pausaMs = opciones.pausaMs ?? 250;
  const rutas = rutasDeTodaLaApp(ids);
  const total = rutas.length;

  let hechas = 0;
  for (let i = 0; i < total; i += tandaTam) {
    if (opciones.cancelado?.()) break;
    for (const ruta of rutas.slice(i, i + tandaTam)) {
      router.prefetch(ruta);
      hechas++;
    }
    opciones.onProgreso?.({ hechas, total });
    if (i + tandaTam < total) {
      await new Promise((r) => setTimeout(r, pausaMs));
    }
  }

  // Solo se marca si terminó completo: dejar la marca tras una cancelación
  // haría creer que la app está lista para el campo cuando no lo está.
  if (hechas === total) marcarPreparado();
  return { hechas, total };
}
