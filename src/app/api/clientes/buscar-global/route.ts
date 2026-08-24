export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { buscarClientesGlobal } from "@/lib/services/clientes-globales";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const resultados = await buscarClientesGlobal(q, user.ownerId);
    return NextResponse.json(resultados);
  } catch (error) {
    return handleApiError(error);
  }
}
