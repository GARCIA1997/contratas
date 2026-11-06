export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireMonitor } from "@/lib/monitor/datos";
import { esClaveFuncion } from "@/lib/funciones";
import { cambiarFuncion } from "@/lib/services/funciones";

const schema = z.object({
  ownerId: z.string().min(1).max(40),
  clave: z.string().min(1).max(60).refine(esClaveFuncion, "Función desconocida"),
  activa: z.boolean(),
});

/** Enciende o apaga una función en prueba para un espacio de trabajo. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireMonitor();
    const { ownerId, clave, activa } = schema.parse(await req.json());
    if (!esClaveFuncion(clave)) return NextResponse.json({ error: "Función desconocida" }, { status: 400 });
    await cambiarFuncion(ownerId, clave, activa, user.nombre ?? user.email ?? "monitor");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
