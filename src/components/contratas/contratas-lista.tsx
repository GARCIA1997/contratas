"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { EstadoBadge } from "@/components/estado-badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatMoneda } from "@/lib/utils";
import type { ContrataResumen } from "@/components/contratas/tipos";

type Orden = "reciente" | "saldo" | "cliente";
type EstadoFiltro = "ACTIVAS" | "PAGADAS" | "TODAS";

const ESTADO_OPCIONES: { value: EstadoFiltro; label: string }[] = [
  { value: "ACTIVAS", label: "Activas" },
  { value: "PAGADAS", label: "Pagadas" },
  { value: "TODAS", label: "Todas" },
];

export function ContratasLista({
  contratas,
}: {
  contratas: ContrataResumen[];
}) {
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<Orden>("reciente");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("ACTIVAS");

  const visibles = useMemo(() => {
    const filtro = q.trim().toLowerCase();
    const arr = contratas.filter((c) => {
      if (!c.clienteNombre.toLowerCase().includes(filtro)) return false;
      if (estadoFiltro === "ACTIVAS")
        return c.estado !== "LIQUIDADA" && c.estado !== "EN_DEUDA";
      if (estadoFiltro === "PAGADAS") return c.estado === "LIQUIDADA";
      return true;
    });
    arr.sort((a, b) => {
      if (orden === "saldo") return b.saldo - a.saldo;
      if (orden === "cliente")
        return a.clienteNombre.localeCompare(b.clienteNombre);
      return b.creadoEn.localeCompare(a.creadoEn);
    });
    return arr;
  }, [contratas, q, orden, estadoFiltro]);

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

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-8"
          />
        </div>
        <Select
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          className="w-auto pr-8 text-sm"
          aria-label="Ordenar"
        >
          <option value="reciente">Recientes</option>
          <option value="saldo">Mayor saldo</option>
          <option value="cliente">Cliente A-Z</option>
        </Select>
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
