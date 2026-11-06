export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { convertirEnCliente } from "@/lib/services/beneficiarios";

type Params = { params: { id: string } };
const schema = z.object({ telefono: z.string().trim().max(30).optional().nullable() });

/** Convierte el beneficiario en cliente propio (sus contratas se mueven a él). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const { telefono } = schema.parse(await req.json().catch(() => ({})));
    return NextResponse.json(await convertirEnCliente(user.ownerId, params.id, telefono ?? null));
  } catch (error) {
    return handleApiError(error);
  }
}
