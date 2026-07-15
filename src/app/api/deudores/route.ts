export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { deudorSchema } from "@/lib/validaciones";
import {
  crearDeudor,
  deudaVivaGlobal,
  listDeudores,
} from "@/lib/services/deudores";

export async function GET() {
  try {
    const user = await requireUser();
    const [deudores, deudaViva] = await Promise.all([
      listDeudores(user.ownerId),
      deudaVivaGlobal(user.ownerId),
    ]);
    return NextResponse.json({ deudores, deudaViva });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const input = deudorSchema.parse(await req.json());
    const deudor = await crearDeudor(user.ownerId, input);
    return NextResponse.json(deudor, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
