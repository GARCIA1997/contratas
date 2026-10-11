export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { esCronAutorizado } from "@/lib/cron";
import { avisarIncidentes } from "@/lib/whatsapp-auto/alertas-push";

/** Crontab del VPS cada 5 min (ver deploy/crontab.example): avisa por push incidentes graves de WhatsApp. */
export async function GET(req: NextRequest) {
  try {
    if (!esCronAutorizado(req)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, ...(await avisarIncidentes()) });
  } catch (error) {
    return handleApiError(error);
  }
}
