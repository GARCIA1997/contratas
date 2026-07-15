import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/session";

/** Convierte errores conocidos en respuestas JSON consistentes. */
export function handleApiError(error: unknown): NextResponse {
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
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}
