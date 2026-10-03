"use client";

import { useEffect } from "react";
import { reportarError } from "@/lib/report-error";
import { esFallaIndexedDB, reabrirIndexedDB } from "@/lib/offline/dexie-retry";

/** Solo se reporta la PRIMERA falla de IndexedDB por sesión: basta para
 *  verla en el monitor sin que una conexión muerta genere decenas. */
let indexedDBReportado = false;

/**
 * Captura cualquier error de JS o promesa rechazada que se escape sin pasar
 * por un error boundary de React (global-error.tsx solo cubre errores
 * DENTRO del árbol de React) — p. ej. un throw en un event handler o en
 * código async fuera de un componente. Monta una sola vez en el layout raíz.
 */
export function ErrorLogListener() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportarError({
        origen: "client",
        mensaje: event.message || "Error de JS no capturado",
        stack: event.error?.stack ?? null,
      });
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      // Conexión de IndexedDB muerta (bug de iOS, ver dexie-retry.ts): se
      // reabre para que lo siguiente funcione, y se reporta una sola vez.
      if (esFallaIndexedDB(reason)) {
        void reabrirIndexedDB().catch(() => undefined);
        if (indexedDBReportado) return;
        indexedDBReportado = true;
      }
      reportarError({
        origen: "client",
        mensaje:
          reason instanceof Error
            ? reason.message
            : `Promesa rechazada: ${String(reason)}`,
        stack: reason instanceof Error ? reason.stack : null,
      });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
