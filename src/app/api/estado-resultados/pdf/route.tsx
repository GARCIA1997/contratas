export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computeEstadoResultados } from "@/lib/services/estado-resultados-server";
import type { PeriodoEstado } from "@/lib/services/estado-resultados";
import { EstadoResultadosPdf } from "@/lib/pdf/estado-resultados-pdf";

const PERIODOS: PeriodoEstado[] = ["MES", "TRIMESTRE", "ANIO", "HISTORICO"];

/** Sufijo del nombre de archivo, para que dos descargas no se pisen. */
const SUFIJO: Record<PeriodoEstado, string> = {
  MES: "mes",
  TRIMESTRE: "trimestre",
  ANIO: "anio",
  HISTORICO: "historico",
};

export async function GET(req: Request) {
  try {
    const user = await requireAdmin();

    // Un `periodo` inválido (o ausente) cae en MES en vez de reventar: este
    // endpoint se llama desde un <a href>, y un 400 ahí le deja al usuario
    // una pestaña en blanco sin explicación.
    const solicitado = new URL(req.url).searchParams.get("periodo");
    const periodo: PeriodoEstado = PERIODOS.includes(solicitado as PeriodoEstado)
      ? (solicitado as PeriodoEstado)
      : "MES";

    const [datos, config] = await Promise.all([
      computeEstadoResultados(user.ownerId, periodo),
      prisma.configuracion.findUnique({
        where: { ownerId: user.ownerId },
        select: { nombreApp: true },
      }),
    ]);

    const buffer = await renderToBuffer(
      <EstadoResultadosPdf
        datos={datos}
        nombreApp={config?.nombreApp ?? "Kredired"}
      />
    );

    const hoy = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="estado-resultados-${SUFIJO[periodo]}-${hoy}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
