"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EstadoBadge } from "@/components/estado-badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatMoneda } from "@/lib/utils";
import type { ContrataResumen } from "@/components/contratas/tipos";

/**
 * El filtro principal es por estado de cobranza: lo primero que necesitas
 * ver al abrir la app es a quién hay que cobrarle, por eso «Vencidas» es
 * el valor por defecto. «Todas» incluye también las pagadas y las que se
 * pasaron a deuda.
 */
type EstadoFiltro = "VENCIDO" | "PROXIMO" | "AL_CORRIENTE" | "TODAS";

const ESTADO_OPCIONES: { value: EstadoFiltro; label: string }[] = [
  { value: "VENCIDO", label: "Vencidas" },
  { value: "PROXIMO", label: "Próximas" },
  { value: "AL_CORRIENTE", label: "Al día" },
  { value: "TODAS", label: "Todas" },
];

export function ContratasLista({
  contratas,
}: {
  contratas: ContrataResumen[];
}) {
  const [q, setQ] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("VENCIDO");

  const visibles = useMemo(() => {
    const filtro = q.trim().toLowerCase();
    const arr = contratas.filter((c) => {
      if (!c.clienteNombre.toLowerCase().includes(filtro)) return false;
      if (estadoFiltro === "TODAS") return true;
      return c.estado === estadoFiltro;
    });
    // Dentro de un mismo estado, primero el saldo más grande: es lo que
    // más urge cobrar.
    arr.sort((a, b) => b.saldo - a.saldo || b.creadoEn.localeCompare(a.creadoEn));
    return arr;
  }, [contratas, q, estadoFiltro]);

  if (contratas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aún no hay contratas. Crea la primera con el botón «Nueva».
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <SegmentedControl
        value={estadoFiltro}
        onChange={setEstadoFiltro}
        options={ESTADO_OPCIONES}
      />

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-8"
        />
      </div>

      <ul className="space-y-2">
        {visibles.map((c) => (
          <li key={c.id}>
            <Link href={`/contratas/${c.id}`}>
              <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.clienteNombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoneda(c.monto)} · abono {formatMoneda(c.abono)} ·{" "}
                    {c.pagados}/{c.total}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <EstadoBadge estado={c.estado} />
                  <span className="text-xs text-muted-foreground">
                    Saldo {formatMoneda(c.saldo)}
                  </span>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {visibles.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sin resultados.
        </p>
      )}
    </div>
  );
}
