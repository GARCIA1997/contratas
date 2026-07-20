export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { unificarContratasSchema } from "@/lib/validaciones";
import { unificarContratas } from "@/lib/services/contratas";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const { contrataIds, ...input } = unificarContratasSchema.parse(
      await req.json()
    );
    // Idempotente por la misma razón que renovar: la cola offline puede
    // reintentar y no debe crear una segunda contrata unificada.
    const resultado = await withIdempotency(
      req,
      user.ownerId,
      `clientes/${params.id}/unificar`,
      () => unificarContratas(user.ownerId, params.id, contrataIds, input)
    );
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
