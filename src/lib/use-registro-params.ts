"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Reemplazo de `useParams()` para las pantallas de un registro, que ahora
 * reciben el id en la query (`/clientes/ver?id=…`) — ver src/lib/rutas.ts
 * para el porqué. Misma forma que `useParams<{ id: string }>()` para que
 * las páginas no cambien.
 */
export function useRegistroParams(): { id: string } {
  const id = useSearchParams().get("id") ?? "";
  return useMemo(() => ({ id }), [id]);
}
