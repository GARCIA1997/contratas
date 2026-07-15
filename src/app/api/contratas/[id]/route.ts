import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { contrataUpdateSchema } from "@/lib/validaciones";
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
    const contrata = await actualizarContrata(user.ownerId, params.id, input);
    return NextResponse.json(contrata);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const resultado = await withIdempotency(
      req,
      user.ownerId,
      `contratas/${params.id}/delete`,
      async () => {
        await eliminarContrata(user.ownerId, params.id);
        return { ok: true };
      }
    );
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
