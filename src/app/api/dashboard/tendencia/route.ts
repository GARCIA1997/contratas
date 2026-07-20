export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { computeTendencia } from "@/lib/services/dashboard";

export async function GET() {
  try {
    const user = await requireUser();
    const tendencia = await computeTendencia(user.ownerId);
    return NextResponse.json(tendencia);
  } catch (error) {
    return handleApiError(error);
  }
}
