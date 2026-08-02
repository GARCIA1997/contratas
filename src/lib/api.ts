import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/session";
import { registrarError } from "@/lib/error-log";

/** Convierte errores conocidos en respuestas JSON consistentes. */
export async function handleApiError(error: unknown): Promise<NextResponse> {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos inválidos", detalles: error.flatten() },
      { status: 422 }
    );
  }
  console.error("[API] Error inesperado:", error);
  // Solo lo verdaderamente inesperado (500) se guarda — los 401/403/404/422
  // ya controlados arriba (HttpError, ZodError) son parte normal del flujo,
  // no crashes.
  await registrarError({
    origen: "server",
    mensaje: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  });
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}
