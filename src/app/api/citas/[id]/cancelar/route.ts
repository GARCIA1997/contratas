import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { cancelarCita } from "@/lib/services/citas";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const cita = await withIdempotency(
      req,
      user.ownerId,
      `citas/${params.id}/cancelar`,
      () => cancelarCita(user.ownerId, params.id)
    );
    return NextResponse.json(cita);
  } catch (error) {
    return handleApiError(error);
  }
}
