"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { reportarError } from "@/lib/report-error";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
    reportarError({
      origen: "client",
      mensaje: error.message,
      stack: error.stack ?? null,
      contexto: error.digest ? { digest: error.digest } : null,
    });
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Algo salió mal
            </h1>
            <p style={{ color: "#666" }}>
              Ocurrió un error inesperado. Intenta recargar la página.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
