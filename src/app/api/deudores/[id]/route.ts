import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { deudorSchema } from "@/lib/validaciones";
import {
  actualizarDeudor,
  eliminarDeudor,
  getDeudor,
} from "@/lib/services/deudores";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const deudor = await getDeudor(user.ownerId, params.id);
    return NextResponse.json(deudor);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const input = deudorSchema.partial().parse(await req.json());
    const deudor = await actualizarDeudor(user.ownerId, params.id, input);
    return NextResponse.json(deudor);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    await eliminarDeudor(user.ownerId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
