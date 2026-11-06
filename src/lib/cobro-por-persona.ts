/**
 * Agrupa cuotas por persona (titular o beneficiario) para cobrar solo las de
 * alguien. Puro: lo usan la Ruta, Abonar y Cobrar pendiente, con o sin señal.
 */

export const TITULAR = "__titular__";

export type Persona<T> = { clave: string; nombre: string; esTitular: boolean; items: T[]; total: number };

export function agruparPorPersona<T extends { beneficiarioId?: string | null; beneficiarioNombre?: string | null }>(
  items: T[],
  clienteNombre: string,
  monto: (i: T) => number
): Persona<T>[] {
  const mapa = new Map<string, Persona<T>>();
  for (const i of items) {
    const clave = i.beneficiarioId ?? TITULAR;
    const p =
      mapa.get(clave) ??
      ({
        clave,
        nombre: i.beneficiarioId ? (i.beneficiarioNombre ?? "Beneficiario") : clienteNombre,
        esTitular: !i.beneficiarioId,
        items: [],
        total: 0,
      } as Persona<T>);
    p.items.push(i);
    p.total = Math.round((p.total + monto(i)) * 100) / 100;
    mapa.set(clave, p);
  }
  const titular = mapa.get(TITULAR);
  mapa.delete(TITULAR);
  const resto = Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return titular ? [titular, ...resto] : resto;
}

/** ¿Hay alguien además del titular? Si no, las pantallas se ven como siempre. */
export function hayBeneficiarios(items: { beneficiarioId?: string | null }[]): boolean {
  return items.some((i) => Boolean(i.beneficiarioId));
}

/**
 * ¿La contrata es de alguna de estas personas? Sin lista (o vacía) = todas,
 * que es lo de siempre. TITULAR = las que no tienen beneficiario.
 */
export function esDePersonas(beneficiarioId: string | null | undefined, personas?: string[] | null): boolean {
  if (!personas || personas.length === 0) return true;
  return personas.includes(beneficiarioId ?? TITULAR);
}

/** Lo que llega del teléfono: lista de claves de persona, validada. */
export function leerPersonas(valor: unknown): string[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  const limpias = valor.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 40).slice(0, 50);
  return limpias.length > 0 ? limpias : undefined;
}
