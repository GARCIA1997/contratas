import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { usuarioUpdateSchema } from "@/lib/validaciones";
import { actualizarUsuario, eliminarUsuario } from "@/lib/services/usuarios";
import { registrarAuditoria, ipDeRequest } from "@/lib/audit";

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const input = usuarioUpdateSchema.parse(await req.json());
    const usuario = await actualizarUsuario(admin.ownerId, params.id, input);
    await registrarAuditoria({
      actor: admin,
      accion: "usuario.actualizar",
      entidad: "User",
      entidadId: params.id,
      detalle: input.rol ? { rol: input.rol } : undefined,
      ip: ipDeRequest(req),
    });
    return NextResponse.json(usuario);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdmin();
    await eliminarUsuario(actor.ownerId, params.id, actor.id);
    await registrarAuditoria({
      actor,
      accion: "usuario.eliminar",
      entidad: "User",
      entidadId: params.id,
      ip: ipDeRequest(req),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
