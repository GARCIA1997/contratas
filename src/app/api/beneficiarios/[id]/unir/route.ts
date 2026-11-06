export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { unirBeneficiarios } from "@/lib/services/beneficiarios";

type Params = { params: { id: string } };
const schema = z.object({ destinoId: z.string().min(1).max(40) });

/** Junta este beneficiario (duplicado) con `destinoId`. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const { destinoId } = schema.parse(await req.json());
    return NextResponse.json(await unirBeneficiarios(user.ownerId, params.id, destinoId));
  } catch (error) {
    return handleApiError(error);
  }
}
