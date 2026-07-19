import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { clienteSchema } from "@/lib/validaciones";
import { actualizarCliente, eliminarCliente } from "@/lib/services/clientes";
import { registrarAuditoria, ipDeRequest } from "@/lib/audit";

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const input = clienteSchema.partial().parse(body);
    const cliente = await actualizarCliente(user.ownerId, params.id, input);
    return NextResponse.json(cliente);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    await eliminarCliente(user.ownerId, params.id);
    await registrarAuditoria({
      actor: user,
      accion: "cliente.eliminar",
      entidad: "Cliente",
      entidadId: params.id,
      ip: ipDeRequest(req),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
