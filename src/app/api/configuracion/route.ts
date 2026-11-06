export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { configSchema } from "@/lib/validaciones";
import { updateConfig } from "@/lib/services/configuracion";
import { funcionesActivas } from "@/lib/services/funciones";

export async function GET() {
  try {
    const user = await requireUser();
    // Las funciones en prueba viajan con la configuración: así el teléfono
    // las conoce también sin señal (se guardan junto a ella en Dexie).
    const [config, funciones] = await Promise.all([getConfig(user.ownerId), funcionesActivas(user.ownerId)]);
    return NextResponse.json({ ...config, funciones });
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
