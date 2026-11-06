"use client";

import { useMemo, useState } from "react";
import { UserRoundPlus, Users } from "lucide-react";
import { AdministrarBeneficiario } from "@/components/beneficiarios/administrar-beneficiario";
import { Select } from "@/components/ui/select";
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
  administrar,
}: {
  /** Presente para administradores: convertir un beneficiario en cliente propio. */
  administrar?: { ownerId: string };
  contratas: ContrataDeCliente[];
  /** Para nombrar al titular en la sección de beneficiarios. */
  clienteNombre?: string;
  /** Función "beneficiarios" encendida para el espacio. */
  conBeneficiarios?: boolean;
}) {
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("ACTIVAS");
  const [persona, setPersona] = useState("");
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);

  // Sin beneficiarios (o con la función apagada) la lista es la de siempre.
  const personas = useMemo(() => personasDe(contratas, clienteNombre), [contratas, clienteNombre]);
  const hayBeneficiarios = conBeneficiarios && personas.some((p) => p.clave !== TITULAR);
  const personaElegida = personas.find((p) => p.clave === persona);

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
          <label htmlFor="ver-persona" className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Users className="size-4" /> Contratas de
          </label>
          <Select id="ver-persona" value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Todas las personas</option>
            {personas.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.nombre}
                {p.clave === TITULAR ? " (titular)" : ""}
                {p.activas > 0 ? ` · debe ${formatMoneda(p.saldo)}` : " · sin activas"}
              </option>
            ))}
          </Select>
          {administrar && personaElegida && personaElegida.clave !== TITULAR && (
            <button
              type="button"
              onClick={() => setEditando({ id: personaElegida.clave, nombre: personaElegida.nombre })}
              className="flex items-center gap-1.5 text-sm font-medium text-primary"
            >
              <UserRoundPlus className="size-4" /> Convertir a {personaElegida.nombre} en cliente propio
            </button>
          )}
        </section>
      )}
      {editando && administrar && (
        <AdministrarBeneficiario
          ownerId={administrar.ownerId}
          beneficiario={editando}
          clienteNombre={clienteNombre}
          onCerrar={() => {
            setEditando(null);
            setPersona("");
          }}
        />
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
