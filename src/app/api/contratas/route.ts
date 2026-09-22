import { NextRequest, NextResponse } from "next/server";
import type { TipoContrata } from "@prisma/client";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { contrataSchema } from "@/lib/validaciones";
import { crearContrata, listContratas } from "@/lib/services/contratas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const tipoParam = req.nextUrl.searchParams.get("tipo");
    const tipo =
      tipoParam === "SEMANAL" ||
      tipoParam === "QUINCENAL" ||
      tipoParam === "MENSUAL"
        ? (tipoParam as TipoContrata)
        : undefined;
    const contratas = await listContratas(user.ownerId, tipo);
    return NextResponse.json(contratas);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const input = contrataSchema.parse(body);
    // Idempotente: la cola offline reintenta si la respuesta se pierde
    // justo al reconectar — sin esto, un reintento crearía una segunda
    // contrata (y un segundo cliente, si se creó con clienteNombre) por
    // duplicado.
    const contrata = await withIdempotency(
      req,
      user.ownerId,
      "contratas/crear",
      () => crearContrata(user.ownerId, input, input.incluirOtras ?? false)
    );
    return NextResponse.json(contrata, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
