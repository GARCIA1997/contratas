export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { renovarContrataSchema } from "@/lib/validaciones";
import { renovarContrata } from "@/lib/services/contratas";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const input = renovarContrataSchema.parse(await req.json());
    const resultado = await renovarContrata(
      user.ownerId,
      params.id,
      input,
      input.incluirOtras
    );
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
