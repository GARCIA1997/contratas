import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { marcarEntregada } from "@/lib/services/citas";

type Params = { params: { id: string } };

const bodySchema = z.object({
  contrataCreadaId: z.string().min(1).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const { contrataCreadaId } = bodySchema.parse(body);
    const cita = await withIdempotency(
      req,
      user.ownerId,
      `citas/${params.id}/entregar`,
      () => marcarEntregada(user.ownerId, params.id, contrataCreadaId ?? null)
    );
    return NextResponse.json(cita);
  } catch (error) {
    return handleApiError(error);
  }
}
