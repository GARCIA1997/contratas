/**
 * Reintenta una operación de Dexie si falla con "Attempt to iterate a
 * cursor that doesn't exist" — un bug conocido de IndexedDB en WebKit/Safari
 * (reportado en producción vía ErrorLog, iOS 18.7) que aparece de forma
 * esporádica y transitoria, sin relación con los datos reales. Sin este
 * reintento, el error se propaga hasta useLiveQuery, que lo relanza a
 * propósito durante el render para que un Error Boundary lo capture — como
 * no había uno específico en las páginas autenticadas, tumbaba toda la
 * pantalla (ver src/app/(app)/error.tsx, agregado como segunda red de
 * seguridad para cualquier caso que este reintento no alcance a cubrir).
 */
export async function reintentarSiCursorInvalido<T>(
  fn: () => Promise<T>,
  intentos = 3
): Promise<T> {
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (err) {
      const esCursorInvalido =
        err instanceof Error && err.message.includes("cursor that doesn't exist");
      if (!esCursorInvalido || i === intentos - 1) throw err;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
  /* istanbul ignore next: inalcanzable, el loop siempre retorna o lanza */
  throw new Error("unreachable");
}
