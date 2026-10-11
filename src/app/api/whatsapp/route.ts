export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/session";
import { actualizarCuentaUsuario, cuentaDelUsuario } from "@/lib/whatsapp-auto/usuario";

/** Estado del WhatsApp automático del espacio (sin historial: eso es del monitor). */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await cuentaDelUsuario(user.ownerId));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  activo: z.boolean().optional(),
  aceptoRiesgo: z.boolean().optional(),
  recibos: z.boolean().optional(),
  porVencer: z.boolean().optional(),
  vencidas: z.boolean().optional(),
  deudores: z.boolean().optional(),
  pausada: z.boolean().optional(),
  numeroManual: z.string().max(30).nullable().optional(),
  confirmoMismoNumero: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAdmin();
    await actualizarCuentaUsuario(user.ownerId, schema.parse(await req.json()), user.email);
    return NextResponse.json(await cuentaDelUsuario(user.ownerId));
  } catch (error) {
    return handleApiError(error);
  }
}
