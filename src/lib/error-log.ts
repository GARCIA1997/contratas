import { prisma } from "@/lib/prisma";

export type OrigenError = "client" | "queue" | "server";

/**
 * Guarda un crash/error en la BD propia (complementa a Sentry — ver
 * comentario en el modelo ErrorLog). Nunca lanza: registrar un error jamás
 * debe tumbar la operación real ni el propio manejo de errores.
 */
export async function registrarError(params: {
  origen: OrigenError;
  mensaje: string;
  stack?: string | null;
  url?: string | null;
  userAgent?: string | null;
  ownerId?: string | null;
  actorId?: string | null;
  contexto?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.errorLog.create({
      data: {
        origen: params.origen,
        mensaje: params.mensaje.slice(0, 2000),
        stack: params.stack?.slice(0, 8000) ?? null,
        url: params.url ?? null,
        userAgent: params.userAgent ?? null,
        ownerId: params.ownerId ?? null,
        actorId: params.actorId ?? null,
        contexto: params.contexto
          ? (params.contexto as import("@prisma/client").Prisma.InputJsonValue)
          : undefined,
      },
    });
  } catch {
    // Silencioso a propósito.
  }
}
