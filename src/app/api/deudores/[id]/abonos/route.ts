import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { abonoSchema } from "@/lib/validaciones";
import { agregarAbono } from "@/lib/services/deudores";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const input = abonoSchema.parse(await req.json());
    const deudor = await withIdempotency(
      req,
      user.ownerId,
      `deudores/${params.id}/abonos`,
      () => agregarAbono(user.ownerId, params.id, input)
    );
    return NextResponse.json(deudor, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
