/**
 * Normaliza texto para comparar nombres sin que importen acentos, mayúsculas
 * ni espacios extra — en campo el mismo cliente puede quedar capturado como
 * "José Pérez" o "jose perez" según quién lo haya escrito.
 */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Deja solo dígitos — para comparar teléfonos sin importar espacios, guiones o +52. */
export function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}
