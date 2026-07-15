export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { configSchema } from "@/lib/validaciones";
import { updateConfig } from "@/lib/services/configuracion";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await getConfig(user.ownerId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const input = configSchema.parse(await req.json());
    const cfg = await updateConfig(user.ownerId, input);
    return NextResponse.json(cfg);
  } catch (error) {
    return handleApiError(error);
  }
}
