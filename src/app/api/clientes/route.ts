export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { clienteSchema } from "@/lib/validaciones";
import { crearCliente, listClientes } from "@/lib/services/clientes";

export async function GET() {
  try {
    const user = await requireUser();
    const clientes = await listClientes(user.ownerId);
    return NextResponse.json(clientes);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const input = clienteSchema.parse(body);
    const cliente = await crearCliente(user.ownerId, input);
    return NextResponse.json(cliente, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
