export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { computeRutaDelDia } from "@/lib/services/ruta";

export async function GET() {
  try {
    const user = await requireUser();
    const ruta = await computeRutaDelDia(user.ownerId);
    return NextResponse.json(ruta);
  } catch (error) {
    return handleApiError(error);
  }
}
