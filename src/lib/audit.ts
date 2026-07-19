import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/** IP real del cliente detrás de nginx (X-Forwarded-For / X-Real-IP). */
export function ipDeRequest(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/**
 * Registra una acción sensible en la bitácora de auditoría del espacio de
 * trabajo. Nunca lanza: la auditoría jamás debe tumbar la operación real.
 */
export async function registrarAuditoria(params: {
  actor: SessionUser;
  accion: string;
  entidad?: string;
  entidadId?: string;
  detalle?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        ownerId: params.actor.ownerId,
        actorId: params.actor.id,
        actorNombre: params.actor.nombre,
        accion: params.accion,
        entidad: params.entidad ?? null,
        entidadId: params.entidadId ?? null,
        detalle: params.detalle
          ? (params.detalle as import("@prisma/client").Prisma.InputJsonValue)
          : undefined,
        ip: params.ip ?? null,
      },
    });
  } catch {
    // Silencioso a propósito.
  }
}

export type EntradaAuditoria = {
  id: string;
  actorNombre: string | null;
  accion: string;
  entidad: string | null;
  detalle: Record<string, unknown> | null;
  creadoEn: string;
};

/** Últimas entradas de auditoría del espacio, más recientes primero. */
export async function listAuditoria(
  ownerId: string,
  limite = 100
): Promise<EntradaAuditoria[]> {
  const filas = await prisma.auditLog.findMany({
    where: { ownerId },
    orderBy: { creadoEn: "desc" },
    take: limite,
  });
  return filas.map((f) => ({
    id: f.id,
    actorNombre: f.actorNombre,
    accion: f.accion,
    entidad: f.entidad,
    detalle: (f.detalle as Record<string, unknown> | null) ?? null,
    creadoEn: f.creadoEn.toISOString(),
  }));
}
