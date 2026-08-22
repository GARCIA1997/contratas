export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { getClienteGlobalDetalle } from "@/lib/services/clientes-globales";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const detalle = await getClienteGlobalDetalle(params.id);
    return NextResponse.json(detalle);
  } catch (error) {
    return handleApiError(error);
  }
}
