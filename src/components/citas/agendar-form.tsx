"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check } from "lucide-react";
import type { TipoCitaContrata } from "@/lib/citas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getContratasConSaldo } from "@/lib/offline/repo";
import { syncCitas } from "@/lib/offline/sync";
import { enqueue } from "@/lib/offline/queue";

export type ClienteOpcion = { id: string; nombre: string };

export type CitaInicial = {
  id: string;
  clienteId: string;
  contrataOrigenId: string | null;
  tipo: TipoCitaContrata;
  montoEstimado: number;
  fechaEntrega: string; // yyyy-MM-dd
  notas: string | null;
};

const TIPO_LABEL: Record<TipoCitaContrata, string> = {
  NUEVA: "Nueva",
  RENOVACION: "Renovación",
  SIN_DEFINIR: "Sin definir",
};

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
  const [montoEstimado, setMontoEstimado] = useState(
    inicial ? String(inicial.montoEstimado) : ""
  );
  const [fechaEntrega, setFechaEntrega] = useState(
    inicial?.fechaEntrega ?? new Date().toISOString().slice(0, 10)
  );
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pendienteSync, setPendienteSync] = useState(false);
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
  // cliente) deja de ser válida.
  useEffect(() => {
    setContrataOrigenId(inicial?.clienteId === clienteId ? inicial?.contrataOrigenId ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // "Nueva" nunca lleva contrata origen — si se auto-seleccionó una bajo
  // otro tipo (ver efecto de abajo) y luego se cambia a "Nueva", hay que
  // soltarla explícitamente: nada más la limpia al cambiar de tipo.
  useEffect(() => {
    if (tipo === "NUEVA" && contrataOrigenId) setContrataOrigenId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  // Si solo hay una contrata activa elegible, se asume esa sin pedirle al
  // usuario que elija entre una sola opción.
  useEffect(() => {
    if (tipo !== "NUEVA" && contratasActivas?.length === 1 && !contrataOrigenId) {
      setContrataOrigenId(contratasActivas[0].id);
    }
  }, [tipo, contratasActivas, contrataOrigenId]);

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
      tipo,
      montoEstimado: montoNum,
      fechaEntrega,
      notas: notas.trim() || null,
    };

    setGuardando(true);
    const sinConexion = typeof navigator !== "undefined" && !navigator.onLine;

    if (reagendando) {
      if (ownerId && sinConexion) {
        await enqueue(ownerId, "cita.editar", { citaId: inicial!.id, input });
        setGuardando(false);
        setPendienteSync(true);
        return;
      }
      const res = await fetch(`/api/citas/${inicial!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      setGuardando(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo guardar");
        return;
      }
      if (ownerId) await syncCitas(ownerId);
      router.push(`/clientes/${clienteId}`);
      return;
    }

    if (ownerId && sinConexion) {
      await enqueue(ownerId, "cita.crear", input);
      setGuardando(false);
      setPendienteSync(true);
      return;
    }

    const res = await fetch("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo agendar");
      return;
    }
    if (ownerId) await syncCitas(ownerId);
    setGuardada(true);
  }

  const volverHref = volverHrefProp ?? (clienteId ? `/clientes/${clienteId}` : "/ruta");

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

  if (pendienteSync) {
    return (
      <div className="space-y-4 md:max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight">
          {reagendando ? "Cambios pendientes" : "Cita pendiente"}
        </h1>
        <Card className="border-pendiente/30">
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              Sin conexión — se guardará sola en cuanto el dispositivo tenga
              señal. No hace falta hacer nada más.
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
          <div className="grid grid-cols-3 gap-2">
            {(["NUEVA", "RENOVACION", "SIN_DEFINIR"] as const).map((t) => (
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

        {tipo !== "NUEVA" && clienteId && contratasActivas && contratasActivas.length >= 2 && (
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
            <Input
              id="fecha"
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              required
            />
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
