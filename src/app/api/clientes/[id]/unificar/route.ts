export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { unificarContratasSchema } from "@/lib/validaciones";
import { unificarContratas } from "@/lib/services/contratas";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const { contrataIds, ...input } = unificarContratasSchema.parse(
      await req.json()
    );
    const resultado = await unificarContratas(
      user.ownerId,
      params.id,
      contrataIds,
      input
    );
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
