"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GenerarCorteBoton({
  anio,
  mes,
}: {
  anio: number;
  mes: number;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/corte-caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, mes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo generar el corte");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el corte");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button
        variant="outline"
        className="w-full"
        disabled={cargando}
        onClick={generar}
      >
        <RefreshCw className={cargando ? "size-4 animate-spin" : "size-4"} />
        Generar/actualizar corte del mes en curso
      </Button>
      {error && <p className="text-xs text-vencido">{error}</p>}
    </div>
  );
}
