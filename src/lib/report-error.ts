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
  // `redirect()` y `notFound()` de Next.js se implementan lanzando estos
  // "errores" a propósito; no son fallas y solo llenaban el monitor de ruido.
  if (/NEXT_REDIRECT|NEXT_NOT_FOUND/.test(params.mensaje)) return;
  // "Script error." sin stack: el navegador oculta el detalle porque viene de
  // un script de otro origen (extensiones, traductor o bloqueadores de
  // Safari) — no trae nada con qué diagnosticarlo ni es código de la app.
  if (params.mensaje === "Script error." && !params.stack) return;
  // Stack de Deno (`ext:core/…`): no es un navegador sino un bot que ejecuta
  // el JS de la página (vistas previas de enlaces, rastreadores).
  if (params.stack?.includes("ext:core/")) return;
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
