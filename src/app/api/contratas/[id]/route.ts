import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { contrataUpdateSchema } from "@/lib/validaciones";
import { registrarAuditoria, ipDeRequest } from "@/lib/audit";
import {
  actualizarContrata,
  eliminarContrata,
  getContrata,
} from "@/lib/services/contratas";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const contrata = await getContrata(user.ownerId, params.id);
    return NextResponse.json(contrata);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const input = contrataUpdateSchema.parse(body);
    // Defensa en profundidad para la cola offline: actualizarContrata ya es
    // naturalmente idempotente (regenera el calendario de forma
    // determinista), pero evita trabajo repetido en un reintento.
    const contrata = await withIdempotency(
      req,
      user.ownerId,
      `contratas/${params.id}/editar`,
      () => actualizarContrata(user.ownerId, params.id, input)
    );
    return NextResponse.json(contrata);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    // Se lee antes de borrar para dejar en la bitácora de quién era.
    const previa = await getContrata(user.ownerId, params.id).catch(() => null);
    const resultado = await withIdempotency(
      req,
      user.ownerId,
      `contratas/${params.id}/delete`,
      async () => {
        await eliminarContrata(user.ownerId, params.id);
        return { ok: true };
      }
    );
    await registrarAuditoria({
      actor: user,
      accion: "contrata.eliminar",
      entidad: "Contrata",
      entidadId: params.id,
      detalle: previa
        ? { cliente: previa.cliente.nombre, monto: previa.monto }
        : undefined,
      ip: ipDeRequest(req),
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
