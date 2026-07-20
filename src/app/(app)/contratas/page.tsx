"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import type { TipoContrata } from "@prisma/client";
import { Plus, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContratasLista } from "@/components/contratas/contratas-lista";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getContratas } from "@/lib/offline/repo";
import { cn } from "@/lib/utils";

type Periodo = "TODAS" | TipoContrata;

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "TODAS", label: "Todas" },
  { key: "SEMANAL", label: "Semanal" },
  { key: "QUINCENAL", label: "Quincenal" },
  { key: "MENSUAL", label: "Mensual" },
];

export default function ContratasPage() {
  const claims = useAuthClaims();
  const searchParams = useSearchParams();
  const periodoParam = searchParams.get("periodo");
  const periodo: Periodo =
    periodoParam === "SEMANAL" ||
    periodoParam === "QUINCENAL" ||
    periodoParam === "MENSUAL"
      ? periodoParam
      : "TODAS";

  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready ? claims.esAdmin : false;
  const tipo = periodo === "TODAS" ? undefined : periodo;

  const resumenes = useLiveQuery(
    () => (ownerId ? getContratas(ownerId, tipo) : undefined),
    [ownerId, tipo]
  );

  const nuevaTipo = periodo === "TODAS" ? "SEMANAL" : periodo;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Contratas</h1>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" asChild>
            <Link href="/calculadora">
              <Calculator className="size-4" /> Calculadora
            </Link>
          </Button>
          {esAdmin && (
            <Button asChild size="sm">
              <Link href={`/contratas/nueva?tipo=${nuevaTipo}`}>
                <Plus className="size-4" /> Nueva
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-full bg-muted p-1">
        {PERIODOS.map((p) => (
          <Link
            key={p.key}
            href={p.key === "TODAS" ? "/contratas" : `/contratas?periodo=${p.key}`}
            className={cn(
              "flex-1 rounded-full py-1.5 text-center text-xs font-medium transition-colors sm:text-sm",
              periodo === p.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {resumenes ? (
        <ContratasLista contratas={resumenes} />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      )}
    </div>
  );
}
