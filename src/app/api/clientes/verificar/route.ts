export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { verificarClienteNuevo } from "@/lib/services/clientes-globales";

const schema = z.object({
  nombre: z.string().trim().max(120).default(""),
  telefono: z.string().trim().max(30).optional().nullable(),
});

/** ¿El cliente que se va a registrar ya existe (propio o con otro administrador)? */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    // Petición cancelada a medio camino (cuerpo vacío): no es un error del servidor.
    const cuerpo = await req.json().catch(() => null);
    if (!cuerpo) return NextResponse.json({ error: "Cuerpo vacío" }, { status: 400 });
    const datos = schema.parse(cuerpo);
    return NextResponse.json(await verificarClienteNuevo(user.ownerId, datos));
  } catch (error) {
    return handleApiError(error);
  }
}
