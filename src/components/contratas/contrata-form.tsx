"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";
import { enqueue } from "@/lib/offline/queue";
import {
  ContrataCreadaPanel,
  type ContrataCreada,
} from "@/components/contratas/contrata-creada";

export type ClienteOpcion = { id: string; nombre: string };

export type ContrataInicial = {
  id: string;
  clienteId: string;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  fechaInicio: string; // yyyy-MM-dd
  notas: string | null;
};

export function ContrataForm({
  clientes,
  cuotasPorDefecto,
  maxCuotas,
  tipoInicial,
  nombreApp,
  inicial,
  clientePreseleccionado,
  volverHref: volverHrefProp,
}: {
  clientes: ClienteOpcion[];
  cuotasPorDefecto: number;
  maxCuotas: number;
  tipoInicial: TipoContrata;
  /** Para el mensaje de WhatsApp que se ofrece al terminar de registrarla. */
  nombreApp: string;
  inicial?: ContrataInicial;
  /** Si se crea desde el perfil de un cliente: se omite el selector. */
  clientePreseleccionado?: ClienteOpcion;
  volverHref?: string;
}) {
  const router = useRouter();
  const claims = useAuthClaims();
  const editando = !!inicial;
  const clienteFijo = !editando && !!clientePreseleccionado;

  const [clienteMode, setClienteMode] = useState<"existente" | "nuevo">(
    clientes.length > 0 ? "existente" : "nuevo"
  );
  const [clienteId, setClienteId] = useState(
    inicial?.clienteId ?? clientePreseleccionado?.id ?? ""
  );
  const [clienteQuery, setClienteQuery] = useState(
    clientePreseleccionado?.nombre ??
      (editando
        ? clientes.find((c) => c.id === inicial?.clienteId)?.nombre ?? ""
        : "")
  );
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const [clienteNombre, setClienteNombre] = useState("");
  const [tipo, setTipo] = useState<TipoContrata>(inicial?.tipo ?? tipoInicial);
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : "");
  const [numCuotas, setNumCuotas] = useState(
    inicial?.numCuotas ?? cuotasPorDefecto
  );
  const [fechaInicio, setFechaInicio] = useState(
    inicial?.fechaInicio ?? new Date().toISOString().slice(0, 10)
  );
  const [abono, setAbono] = useState(inicial ? String(inicial.abono) : "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");

  const abonoTocado = useRef(editando);
  const [fechas, setFechas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** Contrata recién creada: cambia el formulario por el panel de entrega. */
  const [creada, setCreada] = useState<ContrataCreada | null>(null);
  /** Se creó offline: sin id todavía, se sincroniza sola después. */
  const [pendienteSync, setPendienteSync] = useState(false);

  const sugerencias = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes.slice(0, 6);
    return clientes
      .filter((c) => c.nombre.toLowerCase().includes(q))
      .slice(0, 6);
  }, [clientes, clienteQuery]);

  // Preview de abono sugerido + fechas cuando cambian los parámetros.
  useEffect(() => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0 || !fechaInicio || numCuotas < 1) {
      setFechas([]);
      return;
    }
    let cancelado = false;
    // Debounce: evita que cada tecla dispare un fetch (y el re-render que
    // viene con él) a mitad de la escritura.
    const timer = setTimeout(() => {
      (async () => {
        const res = await fetch("/api/contratas/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, monto: montoNum, fechaInicio, numCuotas }),
        });
        if (!res.ok || cancelado) return;
        const data = await res.json();
        setFechas(data.fechas);
        if (!abonoTocado.current) setAbono(String(data.abonoSugerido));
      })();
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [tipo, monto, fechaInicio, numCuotas]);

  function elegirCliente(c: ClienteOpcion) {
    setClienteId(c.id);
    setClienteQuery(c.nombre);
    setSugerenciasAbiertas(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const montoNum = parseFloat(monto);
    const abonoNum = parseFloat(abono);
    if (!montoNum || montoNum <= 0) return setError("Monto inválido");
    if (!abonoNum || abonoNum <= 0) return setError("Abono inválido");
    if (clienteMode === "existente" && !clienteFijo && !clienteId)
      return setError("Elige un cliente de la lista");
    if (clienteMode === "nuevo" && !clienteNombre.trim())
      return setError("Escribe el nombre del cliente");

    const payload = {
      tipo,
      monto: montoNum,
      abono: abonoNum,
      fechaInicio,
      numCuotas,
      notas: notas.trim() || null,
      ...(clienteMode === "existente"
        ? { clienteId }
        : { clienteNombre: clienteNombre.trim() }),
    };

    setGuardando(true);

    // Tanto editar como crear se hacen en campo, con el cliente presente —
    // pero SOLO se encolan cuando de verdad no hay conexión: si hay señal
    // real, se guardan directo (igual que siempre) para no mostrarle al
    // usuario un mensaje de "pendiente de conexión" cuando sí tiene internet
    // (bug reportado: se marcaba offline al entregar una contrata con señal).
    const sinConexion = typeof navigator !== "undefined" && !navigator.onLine;

    if (editando && sinConexion && claims.ready && claims.ownerId) {
      await enqueue(claims.ownerId, "contrata.editar", {
        contrataId: inicial!.id,
        input: payload,
      });
      setGuardando(false);
      router.push(`/contratas/${inicial!.id}`);
      return;
    }

    if (!editando && sinConexion && claims.ready && claims.ownerId) {
      // A diferencia de editar, no hay id todavía (ni de la contrata ni,
      // si aplica, de un cliente nuevo) — los asigna el servidor. No se
      // puede mostrar el panel de entrega/WhatsApp de inmediato; en cuanto
      // sincronice aparece sola en la lista, y desde ahí se puede compartir
      // el recibo por WhatsApp manualmente (ver recibo-view.tsx).
      await enqueue(claims.ownerId, "contrata.crear", payload);
      setGuardando(false);
      setPendienteSync(true);
      return;
    }

    const res = await fetch(
      editando ? `/api/contratas/${inicial!.id}` : "/api/contratas",
      {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    const guardada = await res.json();
    // La UI lee de IndexedDB (offline-first): sin este sync la contrata
    // nueva no aparece en listas/dashboard hasta la próxima recarga completa.
    if (claims.ready && claims.ownerId) await syncAll(claims.ownerId);

    // Al crear no se navega de inmediato: se muestra la confirmación con la
    // opción de mandarle los detalles al cliente por WhatsApp, que es justo
    // el momento de la entrega. Al editar sí se vuelve a la contrata.
    if (!editando) {
      setCreada(guardada as ContrataCreada);
      return;
    }
    router.push(`/contratas/${guardada.id}`);
    router.refresh();
  }

  const volverHref = volverHrefProp ?? "/contratas";

  if (creada) {
    return <ContrataCreadaPanel nombreApp={nombreApp} contrata={creada} />;
  }

  if (pendienteSync) {
    return (
      <div className="space-y-4 md:max-w-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Contrata pendiente
          </h1>
        </div>
        <Card className="border-pendiente/30">
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              Se creará sola en cuanto el dispositivo tenga conexión — no
              hace falta hacer nada más. Para enviarle los detalles al
              cliente por WhatsApp, hazlo manualmente después, desde el
              recibo de la contrata, en cuanto aparezca en la lista.
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
        <Link href={editando ? `/contratas/${inicial!.id}` : volverHref}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">
        {editando ? "Editar contrata" : "Nueva contrata"}
      </h1>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Cliente */}
        <div className="space-y-2">
          {!clienteFijo && (
            <div className="flex items-center justify-between">
              <Label>Cliente</Label>
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  setClienteMode((m) => (m === "existente" ? "nuevo" : "existente"));
                  setSugerenciasAbiertas(false);
                }}
              >
                {clienteMode === "existente" ? "+ Nuevo cliente" : "Elegir existente"}
              </button>
            </div>
          )}

          {clienteFijo ? (
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-input bg-secondary/50 px-4">
              <Check className="size-4 text-primary" />
              <span className="text-sm font-medium">
                {clientePreseleccionado!.nombre}
              </span>
            </div>
          ) : clienteMode === "existente" ? (
            <div className="relative">
              <Input
                value={clienteQuery}
                onChange={(e) => {
                  setClienteQuery(e.target.value);
                  setClienteId("");
                  setSugerenciasAbiertas(true);
                }}
                onFocus={() => setSugerenciasAbiertas(true)}
                onBlur={() =>
                  setTimeout(() => setSugerenciasAbiertas(false), 120)
                }
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
                        {clienteId === c.id && (
                          <Check className="size-4 text-primary" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sugerenciasAbiertas &&
                clienteQuery.trim() &&
                sugerencias.length === 0 && (
                  <div className="glass absolute z-10 mt-1 w-full rounded-2xl p-3 text-sm text-muted-foreground shadow-lg">
                    Sin coincidencias.
                  </div>
                )}
            </div>
          ) : (
            <Input
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              placeholder="Nombre del nuevo cliente"
            />
          )}
        </div>

        {/* Tipo */}
        <div className="space-y-2">
          <Label>Tipo</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["SEMANAL", "QUINCENAL", "MENSUAL"] as const).map((t) => (
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
                {t === "SEMANAL"
                  ? "Semanal"
                  : t === "QUINCENAL"
                    ? "Quincenal"
                    : "Mensual"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="monto">Monto</Label>
            <Input
              id="monto"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cuotas">Cuotas</Label>
            <Input
              id="cuotas"
              type="number"
              min="1"
              max={maxCuotas}
              value={numCuotas}
              onChange={(e) => setNumCuotas(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha de inicio</Label>
            <Input
              id="fecha"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="abono">Abono (editable)</Label>
            <Input
              id="abono"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={abono}
              onChange={(e) => {
                abonoTocado.current = true;
                setAbono(e.target.value);
              }}
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

        {/* Preview de fechas */}
        {fechas.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {fechas.length} pagos de {formatMoneda(parseFloat(abono) || 0)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {fechas.map((f, i) => (
                  <span
                    key={i}
                    className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
                  >
                    {i + 1}. {format(anclarFechaCliente(f), "d MMM", { locale: es })}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={guardando}>
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear contrata"}
        </Button>
      </form>
    </div>
  );
}
