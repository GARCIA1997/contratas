"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export type ClienteItem = {
  id: string;
  nombre: string;
  telefono: string | null;
  numContratas: number;
};

export function ClientesLista({ clientes }: { clientes: ClienteItem[] }) {
  const [q, setQ] = useState("");

  const visibles = useMemo(() => {
    const filtro = q.trim().toLowerCase();
    return clientes.filter((c) => c.nombre.toLowerCase().includes(filtro));
  }, [clientes, q]);

  if (clientes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay clientes registrados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative md:max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-8"
        />
      </div>
      <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
        {visibles.map((c) => (
          <li key={c.id}>
            <Link href={`/clientes/${c.id}`}>
              <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.telefono ? `${c.telefono} · ` : ""}
                    {c.numContratas} contrata{c.numContratas === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
