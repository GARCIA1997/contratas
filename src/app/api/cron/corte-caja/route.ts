export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { esCronAutorizado } from "@/lib/cron";
import { generarCorteCajaTodosLosOwners } from "@/lib/services/corte-caja";

/** Usado por el crontab del VPS el último día de cada mes (ver deploy/crontab.example). */
export async function GET(req: NextRequest) {
  try {
    if (!esCronAutorizado(req)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const resultado = await generarCorteCajaTodosLosOwners();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    return handleApiError(error);
  }
}
