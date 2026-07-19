import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Health check público y ligero para monitoreo externo (UptimeRobot, etc.).
 * Verifica que la app responde y que la base de datos está accesible.
 * Devuelve 200 si todo bien, 503 si la BD no responde. No expone datos.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json(
      { status: "error", db: "down" },
      { status: 503 }
    );
  }
}
