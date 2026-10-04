export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { ignorarCaso, requireMonitor, restaurarIgnorados } from "@/lib/monitor/datos";

const schema = z.object({
  accion: z.enum(["ignorar", "restaurar"]),
  revision: z.string().min(1).max(60),
  clave: z.string().min(1).max(300).optional(),
});

/** Ignorar un caso revisado de Calidad, o restaurar los ignorados de una revisión. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireMonitor();
    const { accion, revision, clave } = schema.parse(await req.json());
    if (accion === "ignorar") {
      if (!clave) return NextResponse.json({ error: "Falta el caso" }, { status: 400 });
      await ignorarCaso(revision, clave, user.nombre ?? user.email);
    } else {
      await restaurarIgnorados(revision);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
