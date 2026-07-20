export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { listCortesCaja, generarCorteCaja } from "@/lib/services/corte-caja";

export async function GET() {
  try {
    const user = await requireAdmin();
    const cortes = await listCortesCaja(user.ownerId);
    return NextResponse.json(cortes);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Genera o regenera manualmente el corte de un mes específico. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const { anio, mes } = await req.json();
    if (
      !Number.isInteger(anio) ||
      !Number.isInteger(mes) ||
      mes < 1 ||
      mes > 12
    ) {
      return NextResponse.json({ error: "anio/mes inválidos" }, { status: 400 });
    }
    const corte = await generarCorteCaja(user.ownerId, anio, mes);
    return NextResponse.json(corte);
  } catch (error) {
    return handleApiError(error);
  }
}
