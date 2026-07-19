import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, HttpError } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { abonarPago, limpiarPago } from "@/lib/services/contratas";
import { registrarAuditoria, ipDeRequest } from "@/lib/audit";

type Params = { params: { id: string; cuota: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const numeroCuota = Number(params.cuota);
    if (!Number.isInteger(numeroCuota) || numeroCuota < 1) {
      throw new HttpError(400, "Número de cuota inválido");
    }
    const body = await req.json();
    const monto = Number(body?.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new HttpError(400, "Monto inválido");
    }
    const contrata = await withIdempotency(
      req,
      user.ownerId,
      `contratas/${params.id}/pagos/${numeroCuota}/abonar`,
      () => abonarPago(user.ownerId, params.id, numeroCuota, monto)
    );
    return NextResponse.json(contrata);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Revierte la cuota a pendiente sin abonos. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const numeroCuota = Number(params.cuota);
    if (!Number.isInteger(numeroCuota) || numeroCuota < 1) {
      throw new HttpError(400, "Número de cuota inválido");
    }
    const contrata = await withIdempotency(
      req,
      user.ownerId,
      `contratas/${params.id}/pagos/${numeroCuota}/abonar/revertir`,
      () => limpiarPago(user.ownerId, params.id, numeroCuota)
    );
    await registrarAuditoria({
      actor: user,
      accion: "pago.revertir",
      entidad: "Contrata",
      entidadId: params.id,
      detalle: { cliente: contrata.cliente.nombre, cuota: numeroCuota },
      ip: ipDeRequest(req),
    });
    return NextResponse.json(contrata);
  } catch (error) {
    return handleApiError(error);
  }
}
