export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { usuarioSchema } from "@/lib/validaciones";
import { crearUsuario, listUsuarios } from "@/lib/services/usuarios";

export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json(await listUsuarios(admin.ownerId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = usuarioSchema.parse(await req.json());
    const usuario = await crearUsuario(admin.ownerId, input);
    return NextResponse.json(usuario, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
