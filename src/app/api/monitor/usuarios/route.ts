export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getEspacios, requireMonitor } from "@/lib/monitor/datos";
import { desdeDeReq } from "../_rango";

export async function GET(req: NextRequest) {
  try {
    await requireMonitor();
    return NextResponse.json(await getEspacios(desdeDeReq(req)));
  } catch (error) {
    return handleApiError(error);
  }
}
