export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getError, requireMonitor } from "@/lib/monitor/datos";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireMonitor();
    return NextResponse.json(await getError(params.id));
  } catch (error) {
    return handleApiError(error);
  }
}
