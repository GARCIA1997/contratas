export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { convertirADeuda } from "@/lib/services/contratas";
import { registrarAuditoria, ipDeRequest } from "@/lib/audit";

type Params = { params: { id: string } };

/** Marca el saldo pendiente de la contrata como deuda (proceso manual). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const resultado = await withIdempotency(
      req,
      user.ownerId,
      `contratas/${params.id}/marcar-deuda`,
      () => convertirADeuda(user.ownerId, params.id)
    );
    await registrarAuditoria({
      actor: user,
      accion: "contrata.marcarDeuda",
      entidad: "Contrata",
      entidadId: params.id,
      detalle: resultado as Record<string, unknown>,
      ip: ipDeRequest(req),
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
