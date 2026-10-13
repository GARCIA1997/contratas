export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { getComparacionContratas, requireMonitor } from "@/lib/monitor/datos";

const schema = z.object({ a: z.string().min(1).max(40), b: z.string().min(1).max(40) });

/** Datos de las dos contratas de un caso de "posibles duplicadas" para compararlas. */
export async function GET(req: NextRequest) {
  try {
    await requireMonitor();
    const { a, b } = schema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const r = await getComparacionContratas(a, b);
    if (!r) return NextResponse.json({ error: "Alguna de las contratas ya no existe" }, { status: 404 });
    return NextResponse.json(r);
  } catch (error) {
    return handleApiError(error);
  }
}
