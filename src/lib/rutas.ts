/**
 * URLs de las pantallas de la app. Fuente única: ningún componente arma a
 * mano una URL de detalle.
 *
 * Las pantallas de un registro (cliente, contrata, deudor, cita) son rutas
 * ESTÁTICAS con el id en la query — `/clientes/ver?id=…`, no
 * `/clientes/<id>`. Es lo que permite abrir cualquier registro sin señal:
 * una ruta dinámica solo abre offline si ESE id ya se había descargado (y
 * un cliente creado sin señal nunca lo está), mientras que una estática se
 * descarga una vez y sirve para todos, porque la página lee sus datos de
 * IndexedDB. Las URLs viejas redirigen a estas (ver `redirects` en
 * next.config.mjs).
 */

function conId(ruta: string, id: string, extra: Record<string, string | null | undefined> = {}) {
  const q = new URLSearchParams({ id });
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return `${ruta}?${q.toString()}`;
}

export const rutas = {
  cliente: (id: string) => conId("/clientes/ver", id),
  clienteEditar: (id: string) => conId("/clientes/editar", id),
  clienteHistorial: (id: string) => conId("/clientes/historial", id),
  clienteEstadoCuenta: (id: string) => conId("/clientes/estado-cuenta", id),
  clienteUnificar: (id: string, citaId?: string | null) => conId("/clientes/unificar", id, { citaId }),

  contrata: (id: string) => conId("/contratas/ver", id),
  contrataEditar: (id: string) => conId("/contratas/editar", id),
  contrataRecibo: (id: string) => conId("/contratas/recibo", id),
  contrataRenovar: (id: string, citaId?: string | null) => conId("/contratas/renovar", id, { citaId }),

  deudor: (id: string) => conId("/deudores/ver", id),
  deudorEditar: (id: string) => conId("/deudores/editar", id),
  deudorEstadoCuenta: (id: string) => conId("/deudores/estado-cuenta", id),

  citaEditar: (id: string) => conId("/citas/editar", id),
};

/**
 * Todas las pantallas que funcionan sin señal (leen de IndexedDB). Es lo
 * que se descarga para trabajar offline: ~30 rutas fijas, sin importar
 * cuántos clientes o contratas haya.
 *
 * Quedan fuera las que dependen del servidor por naturaleza: administración
 * (usuarios, auditoría, corte de caja) y la búsqueda global en la cartera
 * de otros usuarios.
 */
export const PANTALLAS_OFFLINE = [
  "/",
  "/ruta",
  "/calculadora",
  "/config",
  "/estado-resultados",
  "/clientes",
  "/clientes/nuevo",
  "/clientes/ver",
  "/clientes/editar",
  "/clientes/historial",
  "/clientes/estado-cuenta",
  "/clientes/unificar",
  "/contratas",
  "/contratas/nueva",
  "/contratas/ver",
  "/contratas/editar",
  "/contratas/recibo",
  "/contratas/renovar",
  "/deudores",
  "/deudores/nuevo",
  "/deudores/ver",
  "/deudores/editar",
  "/deudores/estado-cuenta",
  "/citas/nueva",
  "/citas/editar",
  "/offline",
] as const;
