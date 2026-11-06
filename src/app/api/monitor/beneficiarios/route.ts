export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireMonitor } from "@/lib/monitor/datos";
import { duenoDeBeneficiario, renombrarBeneficiario, unirBeneficiarios } from "@/lib/services/beneficiarios";

const schema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("renombrar"), id: z.string().min(1).max(40), nombre: z.string().trim().min(1).max(80) }),
  z.object({ accion: z.literal("unir"), id: z.string().min(1).max(40), destinoId: z.string().min(1).max(40) }),
]);

/** Cambiar nombre o unir duplicados de beneficiarios (solo desde el monitor). */
export async function POST(req: NextRequest) {
  try {
    await requireMonitor();
    const a = schema.parse(await req.json());
    const ownerId = await duenoDeBeneficiario(a.id);
    if (a.accion === "renombrar") {
      const b = await renombrarBeneficiario(ownerId, a.id, a.nombre);
      return NextResponse.json({ id: b.id, nombre: b.nombre });
    }
    return NextResponse.json(await unirBeneficiarios(ownerId, a.id, a.destinoId));
  } catch (error) {
    return handleApiError(error);
  }
}
