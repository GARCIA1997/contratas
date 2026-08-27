export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { HttpError } from "@/lib/session";
import { withIdempotency } from "@/lib/idempotency";
import { ejecutarAbonoParcial } from "@/lib/services/abono";

type Params = { params: { id: string } };

/**
 * Registra un abono parcial: reparte `monto` entre las contratas del
 * cliente siguiendo la prioridad de `distribuirAbono` (ver
 * services/abono.ts). No hay GET de vista previa — el navegador calcula
 * el desglose antes de confirmar usando los mismos datos que ya tiene en
 * caché offline (ver offline/repo.ts::getContratasParaAbono).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const monto = Number(body?.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new HttpError(400, "Monto inválido");
    }
    const resultado = await withIdempotency(
      req,
      user.ownerId,
      `clientes/${params.id}/abonar`,
      () => ejecutarAbonoParcial(user.ownerId, params.id, monto)
    );
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
