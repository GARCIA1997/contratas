export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { renombrarBeneficiario } from "@/lib/services/beneficiarios";

type Params = { params: { id: string } };
const schema = z.object({ nombre: z.string().trim().min(1).max(80) });

/** Renombra un beneficiario (se corrige en todas sus contratas). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const { nombre } = schema.parse(await req.json());
    const b = await renombrarBeneficiario(user.ownerId, params.id, nombre);
    return NextResponse.json({ id: b.id, nombre: b.nombre });
  } catch (error) {
    return handleApiError(error);
  }
}
