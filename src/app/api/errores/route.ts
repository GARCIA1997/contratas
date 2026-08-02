import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarError, type OrigenError } from "@/lib/error-log";

const ORIGENES: OrigenError[] = ["client", "queue", "server"];

/**
 * Recibe crashes/errores reportados desde el cliente (JS no capturado, cola
 * offline atorada) para guardarlos en la BD (ver ErrorLog). Deliberadamente
 * no exige sesión: un crash puede ocurrir antes de autenticarse (p. ej. en
 * /login), y esta ruta nunca debe fallar por eso — se asocia al usuario
 * cuando hay sesión, y queda sin dueño si no la hay.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const origen = ORIGENES.includes(body?.origen) ? body.origen : "client";
    const mensaje =
      typeof body?.mensaje === "string" && body.mensaje.trim()
        ? body.mensaje
        : "(sin mensaje)";

    const session = await getServerSession(authOptions).catch(() => null);

    await registrarError({
      origen,
      mensaje,
      stack: typeof body?.stack === "string" ? body.stack : null,
      url: typeof body?.url === "string" ? body.url : null,
      userAgent: req.headers.get("user-agent"),
      ownerId: session?.user?.ownerId ?? null,
      actorId: session?.user?.id ?? null,
      contexto:
        body?.contexto && typeof body.contexto === "object"
          ? body.contexto
          : null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Nunca debe romper al llamador — es un reporte best-effort.
    return NextResponse.json({ ok: false });
  }
}
