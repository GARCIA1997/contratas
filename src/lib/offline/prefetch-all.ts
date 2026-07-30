import type { IdsParaPrecarga } from "@/lib/offline/repo";

type RouterPrefetch = { prefetch: (href: string) => void };

/** Sub-rutas de cada tipo de registro que tiene sentido precargar. */
function rutasDeContrata(id: string): string[] {
  return [
    `/contratas/${id}`,
    `/contratas/${id}/editar`,
    `/contratas/${id}/renovar`,
    `/contratas/${id}/recibo`,
  ];
}

function rutasDeCliente(id: string): string[] {
  return [
    `/clientes/${id}`,
    `/clientes/${id}/editar`,
    `/clientes/${id}/historial`,
    `/clientes/${id}/estado-cuenta`,
    `/clientes/${id}/unificar`,
  ];
}

function rutasDeDeudor(id: string): string[] {
  return [`/deudores/${id}`, `/deudores/${id}/editar`, `/deudores/${id}/estado-cuenta`];
}

/**
 * Pantallas de "dar de alta algo nuevo" — no son por id (solo hay una), pero
 * se nos había pasado incluirlas: sin esto, "Nueva contrata" quedaba fuera
 * de la precarga a pesar de que crear una contrata ya funciona offline (ver
 * QueueOpType "contrata.crear"). `/contratas/nueva?tipo=SEMANAL` es la
 * variante real que arma el botón "+ Nueva" de la lista de contratas
 * (siempre manda un `tipo`, nunca la ruta pelona) — se precarga esa además
 * de la ruta sin query por si acaso.
 */
const RUTAS_CREACION = [
  "/contratas/nueva",
  "/contratas/nueva?tipo=SEMANAL",
  "/contratas/nueva?tipo=QUINCENAL",
  "/contratas/nueva?tipo=MENSUAL",
  "/clientes/nuevo",
  "/deudores/nuevo",
];

/**
 * Precarga TODA la app (cada contrata/cliente/deudor y sus subpantallas)
 * escalonado en el tiempo, no de golpe — con cientos de registros, disparar
 * todos los `router.prefetch()` en el mismo tick satura de golpe un VPS
 * chico (1 vCPU). Se agrupan en tandas pequeñas con una pausa entre cada
 * una; a los pocos segundos/minutos de estar en el dashboard con señal,
 * toda la app queda disponible para abrir sin conexión.
 *
 * Solo tiene sentido llamarla con conexión — si no hay red, prefetch() no
 * logra nada de todos modos.
 */
export function precargarTodaLaApp(
  router: RouterPrefetch,
  ids: IdsParaPrecarga,
  opciones: { tandaTam?: number; pausaMs?: number } = {}
): () => void {
  const tandaTam = opciones.tandaTam ?? 15;
  const pausaMs = opciones.pausaMs ?? 400;

  const rutas: string[] = [
    // Primero: son pocas, estáticas y de las más probables de necesitar
    // (dar de alta algo nuevo), así que quedan listas desde la primera tanda.
    ...RUTAS_CREACION,
    ...ids.contratas.flatMap(rutasDeContrata),
    ...ids.clientes.flatMap(rutasDeCliente),
    ...ids.deudores.flatMap(rutasDeDeudor),
  ];

  let cancelado = false;
  let i = 0;

  function tanda() {
    if (cancelado) return;
    const fin = Math.min(i + tandaTam, rutas.length);
    for (; i < fin; i++) {
      router.prefetch(rutas[i]);
    }
    if (i < rutas.length) {
      setTimeout(tanda, pausaMs);
    }
  }

  tanda();

  return () => {
    cancelado = true;
  };
}
