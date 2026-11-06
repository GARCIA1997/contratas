"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EstadoBadge } from "@/components/estado-badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatMoneda } from "@/lib/utils";
import type { ContrataDeCliente } from "@/lib/services/clientes";
import { rutas } from "@/lib/rutas";

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

/** "" = todas · TITULAR = las del propio cliente · id de beneficiario. */
const TITULAR = "__titular__";

type Persona = { clave: string; nombre: string; activas: number; saldo: number };

/** Resumen por persona (titular primero) a partir de las contratas. */
function personasDe(contratas: ContrataDeCliente[], clienteNombre: string): Persona[] {
  const mapa = new Map<string, Persona>();
  for (const c of contratas) {
    const clave = c.beneficiarioId ?? TITULAR;
    const nombre = c.beneficiarioId ? (c.beneficiarioNombre ?? "Beneficiario") : clienteNombre;
    const p = mapa.get(clave) ?? { clave, nombre, activas: 0, saldo: 0 };
    if (c.estado !== "LIQUIDADA" && c.estado !== "EN_DEUDA") {
      p.activas += 1;
      p.saldo = Math.round((p.saldo + c.saldo) * 100) / 100;
    }
    mapa.set(clave, p);
  }
  const titular = mapa.get(TITULAR);
  mapa.delete(TITULAR);
  const resto = Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return titular ? [titular, ...resto] : resto;
}

export function HistorialContratas({
  contratas,
  clienteNombre = "Titular",
  conBeneficiarios = false,
}: {
  contratas: ContrataDeCliente[];
  /** Para nombrar al titular en la sección de beneficiarios. */
  clienteNombre?: string;
  /** Función "beneficiarios" encendida para el espacio. */
  conBeneficiarios?: boolean;
}) {
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("ACTIVAS");
  const [persona, setPersona] = useState("");

  // Sin beneficiarios (o con la función apagada) la lista es la de siempre.
  const personas = useMemo(() => personasDe(contratas, clienteNombre), [contratas, clienteNombre]);
  const hayBeneficiarios = conBeneficiarios && personas.some((p) => p.clave !== TITULAR);

  const visibles = useMemo(() => {
    const filtradas = contratas.filter((c) => {
      if (hayBeneficiarios && persona && (c.beneficiarioId ?? TITULAR) !== persona) return false;
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
  }, [contratas, estadoFiltro, hayBeneficiarios, persona]);

  if (contratas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Este cliente no tiene contratas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {hayBeneficiarios && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Users className="size-4" /> Beneficiarios
          </h3>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
            {personas.map((p) => (
              <li key={p.clave}>
                <button
                  type="button"
                  onClick={() => setPersona((actual) => (actual === p.clave ? "" : p.clave))}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                    persona === p.clave ? "bg-accent" : "hover:bg-accent/60"
                  )}
                  aria-pressed={persona === p.clave}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {p.nombre}
                      {p.clave === TITULAR && <span className="font-normal text-muted-foreground"> (titular)</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.activas === 0
                        ? "Sin contratas activas"
                        : `${p.activas} activa${p.activas === 1 ? "" : "s"} · debe ${formatMoneda(p.saldo)}`}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
          <Select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Ver contratas de">
            <option value="">Todas las personas</option>
            {personas.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.nombre}
                {p.clave === TITULAR ? " (titular)" : ""}
              </option>
            ))}
          </Select>
        </section>
      )}
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
              <Link href={rutas.contrata(c.id)}>
                <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {TIPO_LABEL[c.tipo] ?? c.tipo} · {formatMoneda(c.monto)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.pagados}/{c.total} · saldo {formatMoneda(c.saldo)}
                    </p>
                    {conBeneficiarios && c.beneficiarioNombre && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Users className="size-3" /> {c.beneficiarioNombre}
                      </span>
                    )}
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
