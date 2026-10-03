export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getResumen, requireMonitor } from "@/lib/monitor/datos";
import { rangoDe } from "../_rango";

export async function GET(req: NextRequest) {
  try {
    await requireMonitor();
    return NextResponse.json(await getResumen(rangoDe(req)));
  } catch (error) {
    return handleApiError(error);
  }
}
