export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdmin, HttpError } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCorteCaja } from "@/lib/services/corte-caja";
import { CorteCajaPdf } from "@/lib/pdf/corte-caja-pdf";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin();
    const corte = await getCorteCaja(user.ownerId, params.id);
    if (!corte) throw new HttpError(404, "Corte no encontrado");

    const config = await prisma.configuracion.findUnique({
      where: { ownerId: user.ownerId },
      select: { nombreApp: true },
    });

    const buffer = await renderToBuffer(
      <CorteCajaPdf corte={corte} nombreApp={config?.nombreApp ?? "Kredired"} />
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="corte-caja-${corte.anio}-${String(corte.mes).padStart(2, "0")}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
