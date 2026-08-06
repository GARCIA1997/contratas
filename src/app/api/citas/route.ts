export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { citaSchema } from "@/lib/validaciones";
import { crearCita, listCitas, listCitasDeCliente } from "@/lib/services/citas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const clienteId = req.nextUrl.searchParams.get("clienteId");
    const citas = clienteId
      ? await listCitasDeCliente(user.ownerId, clienteId)
      : await listCitas(user.ownerId);
    return NextResponse.json(citas);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const input = citaSchema.parse(await req.json());
    // Idempotente: la cola offline reintenta si la respuesta se pierde justo
    // al reconectar — sin esto, un reintento crearía una segunda cita.
    const cita = await withIdempotency(req, user.ownerId, "citas/crear", () =>
      crearCita(user.ownerId, input)
    );
    return NextResponse.json(cita, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
