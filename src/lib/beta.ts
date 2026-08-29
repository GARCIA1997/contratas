/**
 * Gates temporales de features en beta con un usuario de prueba.
 *
 * A propósito NO es una variable de entorno `NEXT_PUBLIC_*`: el pipeline
 * de deploy (`docker compose build` en el VPS) no pasa el `.env` como
 * build arg y `.dockerignore` excluye `.env` del contexto — cualquier
 * `NEXT_PUBLIC_*` leído vía `process.env` queda vacío en producción sin
 * que nadie lo note. Una lista fija en código, en cambio, se despliega
 * igual que cualquier otro commit.
 *
 * Agregar o quitar gente de una beta es una línea de código + PR normal.
 */

/** Abono parcial con reparto automático — ver plan en el PR correspondiente. */
const BETA_ABONO_PARCIAL = new Set(["3131128425", "3131182974"]);

export function enBetaAbonoParcial(email: string | null): boolean {
  return email !== null && BETA_ABONO_PARCIAL.has(email);
}
