import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { enviarAOwner, recordatorioCobrosHoy, pushEnabled } from "@/lib/push";

function esCronAutorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Acepta `Authorization: Bearer <secret>` o `x-cron-secret: <secret>`.
  const auth = req.headers.get("authorization");
  const header = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || header === secret;
}

/** Envía el recordatorio de cobros de hoy a TODOS los usuarios suscritos. */
async function enviarATodos() {
  const owners = await prisma.pushSubscription.findMany({
    distinct: ["ownerId"],
    select: { ownerId: true },
  });
  let total = 0;
  for (const { ownerId } of owners) {
    const payload = await recordatorioCobrosHoy(ownerId);
    if (payload) {
      const r = await enviarAOwner(ownerId, payload);
      total += r.enviadas;
    }
  }
  return NextResponse.json({ ok: true, usuarios: owners.length, enviadas: total });
}

/** GET: usado por el crontab del VPS (Authorization: Bearer CRON_SECRET). */
export async function GET(req: NextRequest) {
  try {
    if (!pushEnabled) {
      return NextResponse.json({ error: "Push no configurado" }, { status: 503 });
    }
    if (!esCronAutorizado(req)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return await enviarATodos();
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST: dos modos.
 * - Con cron secret válido: lo envía a TODOS los usuarios.
 * - Autenticado como usuario: lo envía solo a ese usuario (botón «Probar»).
 */
export async function POST(req: NextRequest) {
  try {
    if (!pushEnabled) {
      return NextResponse.json(
        { error: "Push no configurado (faltan claves VAPID)" },
        { status: 503 }
      );
    }

    if (esCronAutorizado(req)) {
      return await enviarATodos();
    }

    const user = await requireUser();
    const payload =
      (await recordatorioCobrosHoy(user.ownerId)) ?? {
        title: "Sin cobros hoy",
        body: "No tienes cuotas que venzan hoy.",
        url: "/",
      };
    const r = await enviarAOwner(user.ownerId, payload);
    return NextResponse.json({ ok: true, enviadas: r.enviadas });
  } catch (error) {
    return handleApiError(error);
  }
}
