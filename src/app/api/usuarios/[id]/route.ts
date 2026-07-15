import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { usuarioUpdateSchema } from "@/lib/validaciones";
import { actualizarUsuario, eliminarUsuario } from "@/lib/services/usuarios";

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const input = usuarioUpdateSchema.parse(await req.json());
    const usuario = await actualizarUsuario(admin.ownerId, params.id, input);
    return NextResponse.json(usuario);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdmin();
    await eliminarUsuario(actor.ownerId, params.id, actor.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
