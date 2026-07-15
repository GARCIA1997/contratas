import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { calcularFechasPago } from "@/lib/fechas";
import { calcularAbono } from "@/lib/contrata";

const previewSchema = z.object({
  tipo: z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"]),
  monto: z.number().positive(),
  fechaInicio: z.string().min(1),
  numCuotas: z.number().int().min(1).max(52),
});

/** Calcula abono sugerido y fechas de pago sin persistir nada. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { tipo, monto, fechaInicio, numCuotas } = previewSchema.parse(
      await req.json()
    );
    const config = await getConfig(user.ownerId);

    const abonoSugerido = calcularAbono(
      monto,
      tipo,
      config.tasaSemanal,
      config.tasaQuincenal,
      numCuotas,
      config.tasaMensual,
      config.cuotasPorDefecto
    );
    const fechas = calcularFechasPago(
      tipo,
      config.modoFechasQuincenal,
      new Date(fechaInicio),
      numCuotas,
      config.diaCobroSemanal
    );

    return NextResponse.json({
      abonoSugerido,
      fechas: fechas.map((f) => f.toISOString()),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
