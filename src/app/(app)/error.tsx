"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { reportarError } from "@/lib/report-error";

/**
 * Error boundary del grupo (app) — sin este archivo, cualquier error de
 * render (incluido el de useLiveQuery: ver comentario abajo) tumbaba TODA
 * la app hasta la pantalla raíz (global-error.tsx), reemplazando incluso el
 * nav. Aquí el resto de la app (header, nav) sigue funcionando; solo se
 * reemplaza el contenido de la página actual.
 */

// dexie-react-hooks relanza a propósito el error del observable de
// useLiveQuery durante el render (para que un Error Boundary lo capture).
// Reportado en campo vía ErrorLog: el bug transitorio de WebKit/Safari
// "Attempt to iterate a cursor that doesn't exist" llegaba hasta acá y
// tumbaba la pantalla — dexie-retry.ts ya reintenta la consulta más
// frecuente (pagosDeContrata) para que casi nunca llegue a pasar esto, pero
// si de todos modos ocurre, aquí no tiene caso mostrarle "algo salió mal"
// al usuario: basta con reintentar solo.
function esCursorInvalidoTransitorio(error: Error) {
  return error.message.includes("cursor that doesn't exist");
}

// Módulo (no estado de React): sobrevive a los remounts que dispara reset(),
// que es justo lo que hay que contar para no reintentar en bucle infinito
// si el error resulta no ser transitorio.
let reintentosCursor = 0;
const MAX_REINTENTOS_CURSOR = 2;

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reintentarSolo =
    esCursorInvalidoTransitorio(error) && reintentosCursor < MAX_REINTENTOS_CURSOR;

  useEffect(() => {
    if (reintentarSolo) {
      reintentosCursor += 1;
      reset();
      return;
    }
    Sentry.captureException(error);
    reportarError({
      origen: "client",
      mensaje: error.message,
      stack: error.stack ?? null,
      contexto: error.digest ? { digest: error.digest } : null,
    });
  }, [error, reset, reintentarSolo]);

  if (reintentarSolo) return null;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-bold">Algo salió mal</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Ocurrió un error inesperado en esta pantalla. Puedes intentar de
        nuevo o navegar a otra sección.
      </p>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  );
}
