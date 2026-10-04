"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function enviar(cuerpo: object) {
  const res = await fetch("/api/monitor/calidad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error("No se pudo guardar");
}

/** Botón "Ignorar" de un caso: revisado y correcto, deja de mostrarse. */
export function BotonIgnorar({ revision, clave }: { revision: string; clave: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"listo" | "enviando" | "error">("listo");
  return (
    <button
      type="button"
      disabled={estado === "enviando"}
      onClick={async () => {
        setEstado("enviando");
        try {
          await enviar({ accion: "ignorar", revision, clave });
          router.refresh();
        } catch {
          setEstado("error");
        }
      }}
      title="Lo revisé y es correcto: dejar de mostrarlo"
      className="flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[15px]">{estado === "error" ? "error" : "visibility_off"}</span>
      {estado === "enviando" ? "…" : estado === "error" ? "Reintentar" : "Ignorar"}
    </button>
  );
}

/** "N ignorados · Restaurar": vuelve a mostrar los casos ignorados de la revisión. */
export function RestaurarIgnorados({ revision, cuantos }: { revision: string; cuantos: number }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  return (
    <span className="font-label-sm text-label-sm text-outline">
      {cuantos} ignorado{cuantos === 1 ? "" : "s"} ·{" "}
      <button
        type="button"
        disabled={enviando}
        onClick={async () => {
          if (!confirm("¿Volver a mostrar los casos ignorados de esta revisión?")) return;
          setEnviando(true);
          try {
            await enviar({ accion: "restaurar", revision });
            router.refresh();
          } finally {
            setEnviando(false);
          }
        }}
        className="text-primary hover:underline disabled:opacity-50"
      >
        Restaurar
      </button>
    </span>
  );
}
