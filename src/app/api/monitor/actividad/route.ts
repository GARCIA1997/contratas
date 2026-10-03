export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getActividad, requireMonitor } from "@/lib/monitor/datos";
import { desdeDeReq } from "../_rango";

export async function GET(req: NextRequest) {
  try {
    await requireMonitor();
    const p = req.nextUrl.searchParams;
    return NextResponse.json(
      await getActividad({
        desde: desdeDeReq(req),
        tipo: p.get("tipo") || undefined,
        q: p.get("q") || undefined,
      })
    );
  } catch (error) {
    return handleApiError(error);
  }
}
