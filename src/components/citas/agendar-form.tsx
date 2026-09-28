"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check } from "lucide-react";
import type { TipoCitaContrata } from "@/lib/citas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FechaInput } from "@/components/ui/fecha-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getContratasConSaldo } from "@/lib/offline/repo";
import { syncCitas } from "@/lib/offline/sync";
import { guardarOperacion } from "@/lib/offline/guardar";
import { mensajeDeError } from "@/lib/offline/conexion";
import { useIdempotencia } from "@/lib/offline/use-idempotencia";
import { rutas } from "@/lib/rutas";

export type ClienteOpcion = { id: string; nombre: string };

export type CitaInicial = {
  id: string;
  clienteId: string;
  contrataOrigenId: string | null;
  contratasUnificarIds?: string[];
  tipo: TipoCitaContrata;
  periodicidad?: "SEMANAL" | "QUINCENAL" | "MENSUAL" | null;
  montoEstimado: number;
  fechaEntrega: string; // yyyy-MM-dd
  notas: string | null;
};

const TIPO_LABEL: Record<TipoCitaContrata, string> = {
  NUEVA: "Nueva",
  RENOVACION: "Renovación",
  UNIFICACION: "Unificación",
  SIN_DEFINIR: "Sin definir",
};

const PERIODICIDAD_LABEL = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
} as const;

export function AgendarForm({
  clientes,
  clientePreseleccionado,
  inicial,
  volverHref: volverHrefProp,
}: {
  clientes: ClienteOpcion[];
  /** Si se agenda desde el perfil de un cliente: se omite el selector. */
  clientePreseleccionado?: ClienteOpcion;
  inicial?: CitaInicial;
  volverHref?: string;
}) {
  const router = useRouter();
  const idem = useIdempotencia();
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const reagendando = !!inicial;
  const clienteFijo = !reagendando && !!clientePreseleccionado;

  const [clienteId, setClienteId] = useState(
    inicial?.clienteId ?? clientePreseleccionado?.id ?? ""
  );
  const [clienteQuery, setClienteQuery] = useState(
    clientePreseleccionado?.nombre ??
      (reagendando
        ? clientes.find((c) => c.id === inicial?.clienteId)?.nombre ?? ""
        : "")
  );
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const [tipo, setTipo] = useState<TipoCitaContrata>(
    inicial?.tipo ?? "SIN_DEFINIR"
  );
  const [contrataOrigenId, setContrataOrigenId] = useState<string | null>(
    inicial?.contrataOrigenId ?? null
  );
  const [contratasUnificarIds, setContratasUnificarIds] = useState<Set<string>>(
    () => new Set(inicial?.contratasUnificarIds ?? [])
  );
  const [periodicidad, setPeriodicidad] = useState<
    "SEMANAL" | "QUINCENAL" | "MENSUAL" | null
  >(inicial?.periodicidad ?? null);
  const [montoEstimado, setMontoEstimado] = useState(
    inicial ? String(inicial.montoEstimado) : ""
  );
  const [fechaEntrega, setFechaEntrega] = useState(
    inicial?.fechaEntrega ?? new Date().toISOString().slice(0, 10)
  );
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState(false);

  const sugerencias = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes.slice(0, 6);
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q)).slice(0, 6);
  }, [clientes, clienteQuery]);

  const contratasActivas = useLiveQuery(
    () =>
      ownerId && clienteId
        ? getContratasConSaldo(ownerId, clienteId)
        : Promise.resolve([]),
    [ownerId, clienteId]
  );

  // Al cambiar de cliente, la contrata origen elegida (si venía de otro
  // cliente) deja de ser válida — igual para la selección de unificar.
  useEffect(() => {
    const mismoCliente = inicial?.clienteId === clienteId;
    setContrataOrigenId(mismoCliente ? inicial?.contrataOrigenId ?? null : null);
    setContratasUnificarIds(
      new Set(mismoCliente ? inicial?.contratasUnificarIds ?? [] : [])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // "Contrata origen" solo aplica a Renovación (y a "Sin definir", que
  // puede llevar un candidato tentativo); "Unificación" usa su propia
  // selección de varias contratas, y "Nueva" no lleva ninguna de las dos.
  useEffect(() => {
    if (tipo !== "RENOVACION" && tipo !== "SIN_DEFINIR" && contrataOrigenId) {
      setContrataOrigenId(null);
    }
    if (tipo !== "UNIFICACION" && contratasUnificarIds.size > 0) {
      setContratasUnificarIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  // Si solo hay una contrata activa elegible, se asume esa sin pedirle al
  // usuario que elija entre una sola opción (no aplica a Unificación: ahí
  // hacen falta 2+, así que no hay "una sola opción" que asumir).
  useEffect(() => {
    if (
      (tipo === "RENOVACION" || tipo === "SIN_DEFINIR") &&
      contratasActivas?.length === 1 &&
      !contrataOrigenId
    ) {
      setContrataOrigenId(contratasActivas[0].id);
    }
  }, [tipo, contratasActivas, contrataOrigenId]);

  function toggleUnificar(id: string) {
    setContratasUnificarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function elegirCliente(c: ClienteOpcion) {
    setClienteId(c.id);
    setClienteQuery(c.nombre);
    setSugerenciasAbiertas(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const montoNum = parseFloat(montoEstimado);
    if (!montoNum || montoNum <= 0) return setError("Monto inválido");
    if (!clienteFijo && !clienteId) return setError("Elige un cliente de la lista");
    if (!fechaEntrega) return setError("Elige la fecha de entrega");

    const input = {
      clienteId,
      contrataOrigenId,
      contratasUnificarIds:
        tipo === "UNIFICACION" ? Array.from(contratasUnificarIds) : [],
      tipo,
      periodicidad,
      montoEstimado: montoNum,
      fechaEntrega,
      notas: notas.trim() || null,
    };

    setGuardando(true);
    try {
      const r = await guardarOperacion({
        ownerId,
        clave: idem.clave(),
        lote: [
          reagendando
            ? { type: "cita.editar", payload: { citaId: inicial!.id, input } }
            : // Id generado aquí: sin señal la cita aparece de inmediato en
              // Ruta y en el perfil, y el servidor la crea con este mismo id.
              { type: "cita.crear", payload: { ...input, id: crypto.randomUUID(), ownerId } },
        ],
      });
      idem.confirmado();
      if (r.enServidor && ownerId) await syncCitas(ownerId);
      // Sin señal el efecto local ya la dejó visible: igual que con señal.
      if (reagendando || !r.enServidor) router.push(rutas.cliente(clienteId));
      else setGuardada(true);
    } catch (e) {
      setError(mensajeDeError(e, reagendando ? "No se pudo guardar" : "No se pudo agendar"));
    } finally {
      setGuardando(false);
    }
  }

  const volverHref = volverHrefProp ?? (clienteId ? rutas.cliente(clienteId) : "/ruta");

  if (guardada) {
    return (
      <div className="space-y-4 md:max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight">Cita agendada</h1>
        <Card className="border-pagado/30">
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              Queda como recordatorio en Ruta — no afecta saldo ni cartera
              hasta que la conviertas en contrata real.
            </p>
          </CardContent>
        </Card>
        <Button className="w-full" asChild>
          <Link href={volverHref}>Volver</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={volverHref}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">
        {reagendando ? "Reagendar cita" : "Agendar cita"}
      </h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Cliente</Label>
          {clienteFijo ? (
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-input bg-secondary/50 px-4">
              <Check className="size-4 text-primary" />
              <span className="text-sm font-medium">
                {clientePreseleccionado!.nombre}
              </span>
            </div>
          ) : (
            <div className="relative">
              <Input
                value={clienteQuery}
                onChange={(e) => {
                  setClienteQuery(e.target.value);
                  setClienteId("");
                  setSugerenciasAbiertas(true);
                }}
                onFocus={() => setSugerenciasAbiertas(true)}
                onBlur={() => setTimeout(() => setSugerenciasAbiertas(false), 120)}
                placeholder="Escribe para buscar…"
                autoComplete="off"
              />
              {sugerenciasAbiertas && sugerencias.length > 0 && (
                <ul className="glass absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl p-1 shadow-lg">
                  {sugerencias.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => elegirCliente(c)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                          clienteId === c.id ? "bg-accent" : ""
                        }`}
                      >
                        {c.nombre}
                        {clienteId === c.id && <Check className="size-4 text-primary" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sugerenciasAbiertas && clienteQuery.trim() && sugerencias.length === 0 && (
                <div className="glass absolute z-10 mt-1 w-full rounded-2xl p-3 text-sm text-muted-foreground shadow-lg">
                  Sin coincidencias.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Tipo</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["NUEVA", "RENOVACION", "UNIFICACION", "SIN_DEFINIR"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`h-10 rounded-full border text-sm font-medium transition-colors ${
                  tipo === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background"
                }`}
              >
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>¿Cada cuánto pagará?</Label>
          {/* Opcional a propósito: al agendar muchas veces todavía no se
              sabe, y la periodicidad real se fija al crear la contrata.
              Sirve para agrupar la lista de "por entregar" en Ruta. Se
              vuelve a tocar el botón activo para dejarlo sin definir. */}
          <div className="grid grid-cols-4 gap-2">
            {(["SEMANAL", "QUINCENAL", "MENSUAL"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodicidad(periodicidad === p ? null : p)}
                className={`h-10 rounded-full border text-sm font-medium transition-colors ${
                  periodicidad === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background"
                }`}
              >
                {PERIODICIDAD_LABEL[p]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriodicidad(null)}
              className={`h-10 rounded-full border text-sm font-medium transition-colors ${
                periodicidad === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background"
              }`}
            >
              Sin definir
            </button>
          </div>
        </div>

        {(tipo === "RENOVACION" || tipo === "SIN_DEFINIR") &&
          clienteId &&
          contratasActivas &&
          contratasActivas.length >= 2 && (
            <div className="space-y-2">
              <Label>¿Cuál contrata se renueva?</Label>
              <ul className="space-y-1.5">
                {contratasActivas.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5">
                      <span className="text-sm">
                        {c.tipo === "SEMANAL"
                          ? "Semanal"
                          : c.tipo === "QUINCENAL"
                            ? "Quincenal"
                            : "Mensual"}{" "}
                        · cuota {c.cuotaPagadaMax}/{c.numCuotas} · saldo{" "}
                        {formatMoneda(c.saldo)}
                      </span>
                      <input
                        type="radio"
                        name="contrataOrigen"
                        className="size-5 shrink-0 accent-primary"
                        checked={contrataOrigenId === c.id}
                        onChange={() => setContrataOrigenId(c.id)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Si todavía no se sabe, se puede dejar sin elegir y decidirse
                después.
              </p>
            </div>
          )}

        {/* Mismo checklist que "Unificar" en el perfil del cliente, pero
            aquí solo se guarda la intención (qué contratas se piensa
            juntar) — la unificación real, con su validación de saldo
            en vivo, pasa hasta que se convierta la cita. */}
        {tipo === "UNIFICACION" &&
          clienteId &&
          contratasActivas &&
          contratasActivas.length >= 2 && (
            <div className="space-y-2">
              <Label>¿Cuáles contratas se unifican?</Label>
              <ul className="space-y-1.5">
                {contratasActivas.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5">
                      <span className="text-sm">
                        {c.tipo === "SEMANAL"
                          ? "Semanal"
                          : c.tipo === "QUINCENAL"
                            ? "Quincenal"
                            : "Mensual"}{" "}
                        · cuota {c.cuotaPagadaMax}/{c.numCuotas} · saldo{" "}
                        {formatMoneda(c.saldo)}
                      </span>
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-primary"
                        checked={contratasUnificarIds.has(c.id)}
                        onChange={() => toggleUnificar(c.id)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {contratasUnificarIds.size === 1
                  ? "Falta elegir al menos una más — se pueden marcar después, al convertir la cita."
                  : "Si todavía no se sabe cuáles, se puede dejar sin marcar y decidirse después."}
              </p>
            </div>
          )}

        {tipo === "UNIFICACION" &&
          clienteId &&
          contratasActivas &&
          contratasActivas.length < 2 && (
            <p className="text-xs text-muted-foreground">
              Este cliente no tiene 2 o más contratas activas para unificar
              todavía.
            </p>
          )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="monto">Monto estimado</Label>
            <Input
              id="monto"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={montoEstimado}
              onChange={(e) => setMontoEstimado(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha de entrega</Label>
            <FechaInput
              id="fecha" value={fechaEntrega} onChange={setFechaEntrega} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notas">Notas</Label>
          <Input
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={guardando}>
          {guardando ? "Guardando…" : reagendando ? "Guardar cambios" : "Agendar cita"}
        </Button>
      </form>
    </div>
  );
}
