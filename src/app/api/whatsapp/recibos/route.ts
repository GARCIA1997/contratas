export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { z } from "zod";
import { cancelarRecibosParaEnvioManual, estadoDeRecibos } from "@/lib/whatsapp-auto/usuario";

/**
 * Estado del recibo automático de uno o varios cobros, por la
 * Idempotency-Key del cobro (?claves=a,b). Solo del espacio del usuario.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const claves = (req.nextUrl.searchParams.get("claves") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 20);
    return NextResponse.json(await estadoDeRecibos(user.ownerId, claves));
  } catch (error) {
    return handleApiError(error);
  }
}

const cuerpoManual = z.object({ claves: z.array(z.string().min(1).max(100)).min(1).max(20) });

/** El usuario manda el recibo a mano: se cancela el automático pendiente para no duplicarlo. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { claves } = cuerpoManual.parse(await req.json());
    const cancelados = await cancelarRecibosParaEnvioManual(user.ownerId, claves);
    return NextResponse.json({ cancelados });
  } catch (error) {
    return handleApiError(error);
  }
}
