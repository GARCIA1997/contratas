"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  cacheAuthClaims,
  claimsSonVigentes,
  getCachedAuthClaims,
  type AuthClaims,
} from "@/lib/offline/auth-cache";
import { onAuthChange } from "@/lib/offline/session-guard";

type Resultado =
  | { ready: false }
  | {
      ready: true;
      ownerId: null;
      esAdmin: false;
      nombre: null;
      email: null;
      offline: boolean;
    }
  | {
      ready: true;
      ownerId: string;
      esAdmin: boolean;
      nombre: string | null;
      /** Identidad de login (en esta app, el número de teléfono). Usada
       *  hoy solo para gates temporales de beta (ver `lib/beta.ts`). */
      email: string | null;
      offline: boolean;
    };

/**
 * Decide, sin depender de un round-trip al servidor, si el shell
 * autenticado se puede renderizar: usa la sesión de NextAuth cuando hay
 * red, y cae a los claims cacheados en IndexedDB cuando no la hay. Es un
 * gate de UI — la autorización real sigue en requireUser/requireAdmin de
 * cada API route.
 */
export function useAuthClaims(): Resultado {
  const { data: session, status } = useSession();
  const [cached, setCached] = useState<AuthClaims | null>(null);
  const [cachedLoaded, setCachedLoaded] = useState(false);

  useEffect(() => {
    getCachedAuthClaims().then((c) => {
      setCached(c);
      setCachedLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      const claims: AuthClaims = {
        userId: session.user.id,
        ownerId: session.user.ownerId || session.user.id,
        email: session.user.email ?? "",
        nombre: session.user.name ?? null,
        rol: session.user.rol,
        cachedAt: new Date().toISOString(),
        sessionExpiresAt: null,
      };
      void cacheAuthClaims(claims);
      // El guard compara por espacio efectivo: los datos locales están
      // keyed por ownerId, así que dos cuentas del mismo espacio comparten
      // caché y un cambio a otro espacio la limpia.
      void onAuthChange(session.user.ownerId || session.user.id);
    }
  }, [status, session?.user?.id]);

  if (status === "authenticated" && session?.user?.id) {
    return {
      ready: true,
      // Espacio efectivo: los datos locales (Dexie) y las queries se
      // scopean al espacio del dueño, igual que el servidor.
      ownerId: session.user.ownerId || session.user.id,
      esAdmin: session.user.rol === "ADMIN",
      nombre: session.user.name ?? null,
      email: session.user.email ?? null,
      offline: false,
    };
  }

  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  // Sin red: no hay forma de que useSession() se resuelva a "authenticated",
  // así que si tenemos claims cacheados vigentes los usamos de inmediato en
  // vez de esperar (nunca va a llegar) una respuesta del servidor.
  if (cachedLoaded && offline && claimsSonVigentes(cached)) {
    return {
      ready: true,
      ownerId: cached!.ownerId ?? cached!.userId,
      esAdmin: cached!.rol === "ADMIN",
      nombre: cached!.nombre,
      email: cached!.email || null,
      offline: true,
    };
  }

  // Con red, esperamos a que useSession() termine de resolver antes de
  // decidir "no autenticado" — decidirlo antes (solo porque los claims
  // cacheados ya cargaron) redirigiría a /login por una carrera falsa
  // aunque la sesión sí sea válida.
  if (status === "loading") {
    return { ready: false };
  }

  return { ready: true, ownerId: null, esAdmin: false, nombre: null, email: null, offline };
}
