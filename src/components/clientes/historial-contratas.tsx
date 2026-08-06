"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EstadoBadge } from "@/components/estado-badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatMoneda } from "@/lib/utils";
import type { ContrataDeCliente } from "@/lib/services/clientes";

type EstadoFiltro = "ACTIVAS" | "PAGADAS" | "TODAS";

const ESTADO_OPCIONES: { value: EstadoFiltro; label: string }[] = [
  { value: "ACTIVAS", label: "Activas" },
  { value: "PAGADAS", label: "Pagadas" },
  { value: "TODAS", label: "Todas" },
];

const TIPO_LABEL: Record<string, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export function HistorialContratas({
  contratas,
}: {
  contratas: ContrataDeCliente[];
}) {
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("ACTIVAS");

  const visibles = useMemo(() => {
    const filtradas = contratas.filter((c) => {
      if (estadoFiltro === "ACTIVAS")
        return c.estado !== "LIQUIDADA" && c.estado !== "EN_DEUDA";
      if (estadoFiltro === "PAGADAS") return c.estado === "LIQUIDADA";
      return true;
    });
    // "Pagadas" se ordena por cuándo terminó de liquidarse (no por cuándo se
    // creó la contrata — una contrata vieja puede haberse terminado de pagar
    // después que una más nueva). Las demás pestañas van por fecha de
    // creación, más reciente primero. Sin este sort explícito, "Pagadas"
    // heredaba el mismo orden que "Activas" (por creadoEn) sin querer.
    const clave: (c: ContrataDeCliente) => string = (c) =>
      estadoFiltro === "PAGADAS" ? (c.ultimaFechaPago ?? c.creadoEn) : c.creadoEn;
    return [...filtradas].sort((a, b) => clave(b).localeCompare(clave(a)));
  }, [contratas, estadoFiltro]);

  if (contratas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Este cliente no tiene contratas.
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
      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sin contratas en este filtro.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((c) => (
            <li key={c.id}>
              <Link href={`/contratas/${c.id}`}>
                <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {TIPO_LABEL[c.tipo] ?? c.tipo} · {formatMoneda(c.monto)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.pagados}/{c.total} · saldo {formatMoneda(c.saldo)}
                    </p>
                  </div>
                  <EstadoBadge estado={c.estado} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
