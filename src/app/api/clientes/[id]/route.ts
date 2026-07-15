import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { clienteSchema } from "@/lib/validaciones";
import { actualizarCliente, eliminarCliente } from "@/lib/services/clientes";

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

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    await eliminarCliente(user.ownerId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
