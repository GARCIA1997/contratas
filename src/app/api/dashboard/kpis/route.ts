export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { computeKpis, type FiltroDashboard } from "@/lib/services/dashboard";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const f = req.nextUrl.searchParams.get("filtro");
    const filtro: FiltroDashboard =
      f === "SEMANAL" || f === "QUINCENAL" ? f : "TODAS";
    const kpis = await computeKpis(user.ownerId, filtro);
    return NextResponse.json(kpis);
  } catch (error) {
    return handleApiError(error);
  }
}
