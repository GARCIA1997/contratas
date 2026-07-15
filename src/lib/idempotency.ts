import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Protege una mutación contra reintentos duplicados (p. ej. la cola de
 * escritura offline reintentando tras perder la respuesta del servidor).
 * Si el header `Idempotency-Key` ya fue procesado para este owner+endpoint,
 * devuelve el resultado guardado en vez de reaplicar la mutación.
 */
export async function withIdempotency<T>(
  req: NextRequest,
  ownerId: string,
  endpoint: string,
  run: () => Promise<T>
): Promise<T> {
  const key = req.headers.get("Idempotency-Key");
  if (!key) return run();

  const previo = await prisma.processedOperation.findUnique({
    where: { id: key },
  });
  if (previo && previo.ownerId === ownerId && previo.endpoint === endpoint) {
    return previo.resultado as T;
  }

  const resultado = await run();
  await prisma.processedOperation
    .create({
      data: { id: key, ownerId, endpoint, resultado: resultado as object },
    })
    // Carrera con otra request concurrente usando la misma key: no es fatal,
    // el resultado ya se calculó y se retorna igual.
    .catch(() => undefined);
  return resultado;
}
