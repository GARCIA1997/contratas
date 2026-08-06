"use client";

import { SessionProvider } from "next-auth/react";
import { ErrorLogListener } from "@/components/error-log-listener";
import { BootWatchdogMarker } from "@/components/boot-watchdog-marker";

export function Providers({ children }: { children: React.ReactNode }) {
  // refetchOnWindowFocus (default: true) revalida la sesión cada vez que la
  // app vuelve a primer plano (p. ej. el usuario revisa un mensaje y regresa
  // en campo, sin señal). Si esa revalidación falla por red, next-auth no
  // ignora el error: borra la sesión del cliente (useSession() cae a
  // status "unauthenticated") aunque la cookie siga siendo válida — esto
  // hacía que la app se comportara como si hubiera cerrado sesión estando
  // offline (bug reportado: mensajes de "sin conexión"/crash al navegar sin
  // señal). use-auth-claims.ts ya cubre el offline real con los claims
  // cacheados en IndexedDB; no hace falta esta revalidación en segundo plano.
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <BootWatchdogMarker />
      <ErrorLogListener />
      {children}
    </SessionProvider>
  );
}
