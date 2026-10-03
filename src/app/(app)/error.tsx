"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { reportarError } from "@/lib/report-error";
import { esFallaIndexedDB, reabrirIndexedDB } from "@/lib/offline/dexie-retry";

/**
 * Error boundary del grupo (app) — sin este archivo, cualquier error de
 * render (incluido el de useLiveQuery: ver comentario abajo) tumbaba TODA
 * la app hasta la pantalla raíz (global-error.tsx), reemplazando incluso el
 * nav. Aquí el resto de la app (header, nav) sigue funcionando; solo se
 * reemplaza el contenido de la página actual.
 */

// dexie-react-hooks relanza a propósito el error del observable de
// useLiveQuery durante el render (para que un Error Boundary lo capture).
// Reportado en campo vía ErrorLog: los bugs de IndexedDB de WebKit/Safari
// (cursor inexistente, "without an in-progress transaction", "internal
// error… Indexed Database server") llegaban hasta acá y tumbaban la
// pantalla. Son de la conexión, no de los datos: se reabre la conexión y
// se reintenta solo, sin mostrarle "algo salió mal" al usuario.

// Módulo (no estado de React): sobrevive a los remounts que dispara reset(),
// que es justo lo que hay que contar para no reintentar en bucle infinito
// si el error resulta no ser transitorio.
// El contador se reinicia tras 30 s sin fallas: cada regreso del segundo
// plano es un episodio nuevo y merece sus propios reintentos.
let reintentosIndexedDB = 0;
let ultimoReintento = 0;
const MAX_REINTENTOS_INDEXEDDB = 2;

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (Date.now() - ultimoReintento > 30_000) reintentosIndexedDB = 0;
  const reintentarSolo =
    esFallaIndexedDB(error) && reintentosIndexedDB < MAX_REINTENTOS_INDEXEDDB;

  useEffect(() => {
    if (reintentarSolo) {
      reintentosIndexedDB += 1;
      ultimoReintento = Date.now();
      void reabrirIndexedDB()
        .catch(() => undefined)
        .then(() => reset());
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
