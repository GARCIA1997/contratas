import { db } from "@/lib/offline/db";

/**
 * Claims mínimos cacheados para decidir, sin round-trip al servidor, si el
 * shell autenticado se puede renderizar offline. Nunca se cachea el JWT/
 * cookie crudo — eso lo maneja NextAuth. Es un gate de UI, no de seguridad:
 * la autorización real sigue viviendo en requireUser/requireAdmin en cada
 * API route.
 */
export type AuthClaims = {
  userId: string;
  /**
   * Espacio de trabajo efectivo (dueño del espacio si es miembro invitado).
   * Opcional por compatibilidad con claims cacheados antes de que
   * existieran los espacios: en ese caso se usa userId como fallback.
   */
  ownerId?: string;
  email: string;
  nombre: string | null;
  rol: "ADMIN" | "VIEWER";
  cachedAt: string;
  /** Timestamp epoch (segundos) de expiración del JWT, si está disponible. */
  sessionExpiresAt: number | null;
};

const KEY = "authClaims";

export async function cacheAuthClaims(claims: AuthClaims): Promise<void> {
  if (!db) return;
  await db.meta.put({ key: KEY, value: claims });
}

export async function getCachedAuthClaims(): Promise<AuthClaims | null> {
  if (!db) return null;
  const row = await db.meta.get(KEY);
  return (row?.value as AuthClaims | undefined) ?? null;
}

export async function clearAuthClaims(): Promise<void> {
  if (!db) return;
  await db.meta.delete(KEY);
}

/** true si hay claims cacheados y no han expirado (o no traen expiración). */
export function claimsSonVigentes(claims: AuthClaims | null): boolean {
  if (!claims) return false;
  if (claims.sessionExpiresAt == null) return true;
  return Date.now() / 1000 < claims.sessionExpiresAt;
}
