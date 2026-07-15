"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoneda } from "@/lib/utils";

export type DeudorItem = {
  id: string;
  nombre: string;
  saldoActual: number;
  numAbonos: number;
};

export function DeudoresLista({ deudores }: { deudores: DeudorItem[] }) {
  const [q, setQ] = useState("");

  const visibles = useMemo(() => {
    const filtro = q.trim().toLowerCase();
    return deudores.filter((d) => d.nombre.toLowerCase().includes(filtro));
  }, [deudores, q]);

  if (deudores.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay deudores registrados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar deudor…"
          className="pl-8"
        />
      </div>
      <ul className="space-y-2">
        {visibles.map((d) => (
          <li key={d.id}>
            <Link href={`/deudores/${d.id}`}>
              <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.numAbonos} abono{d.numAbonos === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant={d.saldoActual > 0 ? "vencido" : "pagado"}>
                  {formatMoneda(d.saldoActual)}
                </Badge>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {visibles.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sin resultados para «{q}».
        </p>
      )}
    </div>
  );
}
