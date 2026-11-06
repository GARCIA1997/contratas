"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar, confirmar } from "@/lib/dialogo";
import { cn } from "@/lib/utils";

const BOTON =
  "flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50";
const CAMPO =
  "rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";

async function enviar(cuerpo: object) {
  const res = await fetch("/api/monitor/beneficiarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "No se pudo guardar");
  return data;
}

/** Cambiar nombre / unir con otro beneficiario del mismo cliente. */
export function AccionesBeneficiario({
  id,
  nombre,
  otros,
}: {
  id: string;
  nombre: string;
  otros: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"nada" | "renombrar" | "unir">("nada");
  const [texto, setTexto] = useState(nombre);
  const [destino, setDestino] = useState(otros[0]?.id ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function correr(fn: () => Promise<unknown>) {
    setOcupado(true);
    try {
      await fn();
      setModo("nada");
      router.refresh();
    } catch (e) {
      await avisar(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  if (modo === "renombrar") {
    return (
      <form
        className="flex flex-wrap items-center justify-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void correr(() => enviar({ accion: "renombrar", id, nombre: texto }));
        }}
      >
        <input className={cn(CAMPO, "w-40")} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
        <button type="submit" className={BOTON} disabled={ocupado || !texto.trim()}>
          Guardar
        </button>
        <button type="button" className={BOTON} onClick={() => setModo("nada")}>
          Cancelar
        </button>
      </form>
    );
  }

  if (modo === "unir") {
    const elegido = otros.find((o) => o.id === destino);
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Es la misma persona que</span>
        <select className={CAMPO} value={destino} onChange={(e) => setDestino(e.target.value)}>
          {otros.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={BOTON}
          disabled={ocupado || !elegido}
          onClick={async () => {
            if (!elegido) return;
            const ok = await confirmar(
              `Las contratas de «${nombre}» pasan a «${elegido.nombre}» y «${nombre}» se elimina. Los pagos no cambian. ¿Unir?`,
              { aceptar: "Unir" }
            );
            if (ok) void correr(() => enviar({ accion: "unir", id, destinoId: elegido.id }));
          }}
        >
          Unir
        </button>
        <button type="button" className={BOTON} onClick={() => setModo("nada")}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-1.5">
      <button type="button" className={BOTON} onClick={() => setModo("renombrar")}>
        <span className="material-symbols-outlined text-[15px]">edit</span>Cambiar nombre
      </button>
      {otros.length > 0 && (
        <button type="button" className={BOTON} onClick={() => setModo("unir")}>
          <span className="material-symbols-outlined text-[15px]">merge</span>Unir con…
        </button>
      )}
    </div>
  );
}
