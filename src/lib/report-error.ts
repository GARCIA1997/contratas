"use client";

/**
 * Reporta un error/crash a /api/errores para guardarlo en la BD (ver
 * ErrorLog). Best-effort a propósito: sin conexión (o si el propio POST
 * falla) simplemente no se guarda — no hay cola/reintento, un crash no es
 * dinero, y encolarlo agregaría complejidad sin beneficio real.
 */
export function reportarError(params: {
  origen: "client" | "queue";
  mensaje: string;
  stack?: string | null;
  contexto?: Record<string, unknown> | null;
}): void {
  try {
    void fetch("/api/errores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origen: params.origen,
        mensaje: params.mensaje,
        stack: params.stack ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        contexto: params.contexto ?? null,
      }),
    }).catch(() => undefined);
  } catch {
    // Silencioso a propósito.
  }
}
