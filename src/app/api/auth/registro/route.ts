export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { registroSchema } from "@/lib/validaciones";
import { registrarUsuario } from "@/lib/services/usuarios";

/** Registro público: crea una cuenta nueva e independiente. */
export async function POST(req: NextRequest) {
  try {
    const input = registroSchema.parse(await req.json());
    const usuario = await registrarUsuario(input);
    return NextResponse.json(usuario, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
