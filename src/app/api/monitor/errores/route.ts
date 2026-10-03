export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getErroresAgrupados, requireMonitor } from "@/lib/monitor/datos";
import { desdeDeReq } from "../_rango";

export async function GET(req: NextRequest) {
  try {
    await requireMonitor();
    const p = req.nextUrl.searchParams;
    return NextResponse.json(
      await getErroresAgrupados({
        desde: desdeDeReq(req),
        origen: p.get("origen") || undefined,
        q: p.get("q") || undefined,
      })
    );
  } catch (error) {
    return handleApiError(error);
  }
}
