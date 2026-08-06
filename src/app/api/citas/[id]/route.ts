import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { citaUpdateSchema } from "@/lib/validaciones";
import { actualizarCita, getCita } from "@/lib/services/citas";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const cita = await getCita(user.ownerId, params.id);
    return NextResponse.json(cita);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const input = citaUpdateSchema.parse(await req.json());
    const cita = await withIdempotency(
      req,
      user.ownerId,
      `citas/${params.id}/editar`,
      () => actualizarCita(user.ownerId, params.id, input)
    );
    return NextResponse.json(cita);
  } catch (error) {
    return handleApiError(error);
  }
}
