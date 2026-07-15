import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, HttpError } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { togglePago } from "@/lib/services/contratas";

type Params = { params: { id: string; cuota: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const numeroCuota = Number(params.cuota);
    if (!Number.isInteger(numeroCuota) || numeroCuota < 1) {
      throw new HttpError(400, "Número de cuota inválido");
    }
    const contrata = await withIdempotency(
      req,
      user.ownerId,
      `contratas/${params.id}/pagos/${numeroCuota}/toggle`,
      () => togglePago(user.ownerId, params.id, numeroCuota)
    );
    return NextResponse.json(contrata);
  } catch (error) {
    return handleApiError(error);
  }
}
