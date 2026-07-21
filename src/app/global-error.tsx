"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
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
