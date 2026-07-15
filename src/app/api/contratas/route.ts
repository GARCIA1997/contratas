import { NextRequest, NextResponse } from "next/server";
import type { TipoContrata } from "@prisma/client";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
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
    const contrata = await crearContrata(user.ownerId, input);
    return NextResponse.json(contrata, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
