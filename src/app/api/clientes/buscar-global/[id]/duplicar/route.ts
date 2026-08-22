import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { duplicarClienteGlobal } from "@/lib/services/clientes-globales";
import { registrarAuditoria, ipDeRequest } from "@/lib/audit";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const cliente = await duplicarClienteGlobal(params.id, user.ownerId);
    await registrarAuditoria({
      actor: user,
      accion: "cliente.duplicarGlobal",
      entidad: "Cliente",
      entidadId: cliente.id,
      detalle: { origenId: params.id, nombre: cliente.nombre },
      ip: ipDeRequest(req),
    });
    return NextResponse.json(cliente, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
