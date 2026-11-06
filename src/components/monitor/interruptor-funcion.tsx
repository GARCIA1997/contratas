"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { avisar, confirmar } from "@/lib/dialogo";

/** Interruptor de una función en prueba para un espacio. */
export function InterruptorFuncion({
  ownerId,
  clave,
  activa,
  usuario,
  funcion,
}: {
  ownerId: string;
  clave: string;
  activa: boolean;
  usuario: string;
  funcion: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activa}
      aria-label={`${funcion} para ${usuario}`}
      disabled={ocupado}
      onClick={async () => {
        const ok = await confirmar(
          activa
            ? `¿Apagar «${funcion}» para ${usuario}? Sus datos no se borran; solo deja de ver las pantallas nuevas (en su teléfono, al siguiente sync).`
            : `¿Encender «${funcion}» para ${usuario} y su equipo? Lo verán al siguiente sync.`,
          { aceptar: activa ? "Apagar" : "Encender" }
        );
        if (!ok) return;
        setOcupado(true);
        try {
          const res = await fetch("/api/monitor/funciones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerId, clave, activa: !activa }),
          });
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo guardar");
          router.refresh();
        } catch (e) {
          await avisar(e instanceof Error ? e.message : "No se pudo guardar");
        } finally {
          setOcupado(false);
        }
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        activa ? "bg-primary" : "bg-surface-container-highest"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-on-surface shadow transition-transform",
          activa ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
