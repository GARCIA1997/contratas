export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import {
  ejecutarCobroVencidas,
  previewCobroVencidas,
} from "@/lib/services/cobros";

type Params = { params: { id: string } };

/** Vista previa: total y cuotas vencidas de las contratas del cliente. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const preview = await previewCobroVencidas(user.ownerId, params.id);
    return NextResponse.json(preview);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Marca como pagadas todas las cuotas vencidas del cliente (pago completo). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const resultado = await withIdempotency(
      req,
      user.ownerId,
      `clientes/${params.id}/cobrar-vencidas`,
      () => ejecutarCobroVencidas(user.ownerId, params.id)
    );
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
