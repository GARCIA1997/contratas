/**
 * Beneficiarios: personas por las que un cliente pide contratas y a quienes
 * él mismo cobra. Funciones puras (las usan el servidor, la app sin señal y
 * las pruebas).
 */

/** Clave de comparación: "  ALEJÁNDRO  " y "alejandro" son la misma persona. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombre para mostrar: sin espacios de más, tal como lo escribieron. */
export function limpiarNombre(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim();
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = tmp;
    }
  }
  return fila[b.length];
}

/**
 * Beneficiarios existentes que podrían ser la misma persona que `nombre`
 * ("Alex" ↔ "Alejandro", "Lupita" ↔ "Lupe", "Alejadro" ↔ "Alejandro").
 * No decide: la pantalla pregunta "¿Es …?".
 */
export function beneficiariosParecidos<T extends { nombre: string }>(nombre: string, lista: T[]): T[] {
  const n = normalizarNombre(nombre);
  if (n.length < 2) return [];
  const primera = (s: string) => s.split(" ")[0];
  return lista.filter((b) => {
    const m = normalizarNombre(b.nombre);
    if (m === n) return true;
    const a = primera(n);
    const c = primera(m);
    if (a.length >= 3 && c.length >= 3 && a.slice(0, 3) === c.slice(0, 3)) return true;
    return distancia(n, m) <= 2;
  });
}

/** El mismo beneficiario (por nombre normalizado) dentro de una lista. */
export function buscarPorNombre<T extends { nombre: string }>(nombre: string, lista: T[]): T | undefined {
  const n = normalizarNombre(nombre);
  return lista.find((b) => normalizarNombre(b.nombre) === n);
}
