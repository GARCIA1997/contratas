"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FechaInput } from "@/components/ui/fecha-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";
import { obtenerPreview, prepararEntregaLocal } from "@/lib/offline/entrega-local";
import { enqueueLote } from "@/lib/offline/queue";
import {
  fetchConTimeout,
  mensajeDeError,
  TIMEOUT_ESCRITURA_MS,
  debeTrabajarLocal,
} from "@/lib/offline/conexion";
import { useIdempotencia } from "@/lib/offline/use-idempotencia";
import {
  ReciboEntregaPanel,
  type ContrataEntregada,
} from "@/components/contratas/recibo-entrega";
import { usePrimerPago } from "@/lib/offline/use-primer-pago";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

type ContrataElegible = { id: string; tipo: TipoContrata; saldo: number };

function siguienteMillar(n: number) {
  return Math.ceil(n / 1000) * 1000;
}

export function UnificarForm({
  clienteId,
  ownerId,
  clienteNombre,
  contratas,
  preseleccion,
  cuotasPorDefecto,
  maxCuotas,
  nombreApp,
  onUnificada,
  citaId,
}: {
  clienteId: string;
  /** Presente cuando la página vive en la capa offline (ver repo/useLiveQuery). */
  ownerId?: string | null;
  clienteNombre: string;
  contratas: ContrataElegible[];
  /** Ids marcadas al agendar una unificación futura (ver `CitaAgendada.
   *  contratasUnificarIds`). Se filtran contra `contratas` a propósito: una
   *  contrata elegida entonces pudo liquidarse mientras tanto y ya no
   *  aparece marcable. */
  preseleccion?: string[];
  cuotasPorDefecto: number;
  maxCuotas: number;
  nombreApp: string;
  /** La página la usa para no redirigir de vuelta apenas las contratas
   * seleccionadas dejen de ser "elegibles" — ver comentario en el page.tsx.
   * Trae `info` (mismo shape que `onRenovada` en renovar-form) para poder
   * cerrar el círculo con la cita agendada, si la hubo. */
  /** Cita que se está entregando: sin señal su enlace se encola en el mismo
   *  lote que la contrata (ver entregarCita). */
  citaId?: string | null;
  onUnificada?: (info?: { contrataId: string | null; offline: boolean }) => void;
}) {
  const claims = useAuthClaims();
  const idem = useIdempotencia();
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(
    () =>
      new Set(
        (preseleccion ?? []).filter((id) => contratas.some((c) => c.id === id))
      )
  );
  const [unificada, setUnificada] = useState<ContrataEntregada & { id: string } | null>(
    null
  );
  const [tipo, setTipo] = useState<TipoContrata>(contratas[0]?.tipo ?? "SEMANAL");
  const [monto, setMonto] = useState("");
  const [montoTocado, setMontoTocado] = useState(false);
  const [numCuotas, setNumCuotas] = useState(cuotasPorDefecto);
  const [fechaInicio, setFechaInicio] = usePrimerPago(tipo);
  const [abono, setAbono] = useState("");
  const [notas, setNotas] = useState("");
  const abonoTocado = useRef(false);
  const [fechas, setFechas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const saldoSeleccionado = Math.round(
    contratas
      .filter((c) => seleccionadas.has(c.id))
      .reduce((s, c) => s + c.saldo, 0) * 100
  ) / 100;
  const sugerencia = siguienteMillar(saldoSeleccionado);
  const montoNum = parseFloat(monto) || 0;
  const entregar = Math.round((montoNum - saldoSeleccionado) * 100) / 100;
  const cubreDeuda = seleccionadas.size >= 2 && montoNum >= saldoSeleccionado;

  // Prellena la sugerencia mientras el usuario no haya editado el monto a mano.
  useEffect(() => {
    if (!montoTocado && saldoSeleccionado > 0) {
      setMonto(String(sugerencia));
    }
  }, [sugerencia, saldoSeleccionado, montoTocado]);

  useEffect(() => {
    if (!montoNum || montoNum <= 0 || !fechaInicio || numCuotas < 1) {
      setFechas([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const data = await obtenerPreview(ownerId, {
            tipo,
            monto: montoNum,
            fechaInicio,
            numCuotas,
          });
          if (!data || cancelado) return;
          setFechas(data.fechas);
          if (!abonoTocado.current) setAbono(String(data.abonoSugerido));
        } catch {
          // Solo es la vista previa: sin red se deja el abono que ya haya
          // escrito el usuario en vez de romper el formulario.
        }
      })();
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [tipo, montoNum, fechaInicio, numCuotas, ownerId]);

  function toggle(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (seleccionadas.size < 2) {
      return setError("Selecciona al menos dos contratas para unificar");
    }
    const abonoNum = parseFloat(abono);
    if (!montoNum || montoNum <= 0) return setError("Monto inválido");
    if (!abonoNum || abonoNum <= 0) return setError("Abono inválido");
    if (!cubreDeuda)
      return setError(
        `El monto debe cubrir el saldo seleccionado (${formatMoneda(saldoSeleccionado)})`
      );

    const contrataIds = Array.from(seleccionadas);
    const input = {
      tipo,
      monto: montoNum,
      abono: abonoNum,
      fechaInicio,
      numCuotas,
      notas: notas.trim() || null,
    };

    setGuardando(true);

    // Unificar crea una contrata nueva — igual que renovar, sin conexión no
    // se conoce su id todavía, así que se encola y se avisa "pendiente". Si
    // hay señal real se guarda directo (antes se encolaba siempre, con o sin
    // conexión, y mostraba el aviso de "pendiente" aunque hubiera internet).
    const sinConexion = debeTrabajarLocal();
    if (ownerId && sinConexion) {
      // Modo local / sin señal: igual que renovar — la contrata nueva nace
      // en el teléfono con su id definitivo, las elegidas quedan liquidadas
      // localmente y se muestra el recibo con WhatsApp. Ver entrega-local.ts.
      try {
        const id = crypto.randomUUID();
        const hoy = new Date();
        const entrega = await prepararEntregaLocal(ownerId, {
          id,
          clienteId,
          input,
          hoy,
          liquidarCompletas: contrataIds,
        });
        // Antes del efecto: la página redirige si deja de ver contratas
        // elegibles y no sabe que esto fue una unificación.
        onUnificada?.({ contrataId: id, offline: true });
        await enqueueLote(ownerId, [
          { type: "cliente.unificar", payload: {
          clienteId,
          contrataIds,
          input: { ...input, id, fechaCaptura: hoy.toISOString() },
          _local: entrega.filas,
        } },
          // En el mismo lote: si no cabe, no se entrega a medias.
          ...(citaId
            ? [{ type: "cita.entregar" as const, payload: { citaId, contrataCreadaId: id } }]
            : []),
        ]);
        setGuardando(false);
        setUnificada(entrega.recibo);
      } catch (e) {
        setGuardando(false);
        setError(e instanceof Error ? e.message : "No se pudo unificar");
      }
      return;
    }

    let res: Response;
    try {
      res = await fetchConTimeout(
        `/api/clientes/${clienteId}/unificar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...idem.header() },
          body: JSON.stringify({ contrataIds, ...input }),
        },
        TIMEOUT_ESCRITURA_MS
      );
    } catch (e) {
      setGuardando(false);
      setError(mensajeDeError(e, "No se pudo unificar"));
      return;
    }
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo unificar");
      return;
    }
    idem.confirmado();
    const data = await res.json();
    // onUnificada() (marca "completado" en la página) va ANTES de syncAll —
    // ver comentario largo en renovar-form.tsx: sin este orden, el
    // useLiveQuery de la página puede reaccionar al cambio en Dexie y
    // redirigir antes de que React procese el setState de "completado".
    onUnificada?.({ contrataId: data.nuevaContrata.id, offline: false });
    if (claims.ready && claims.ownerId) await syncAll(claims.ownerId, { forzar: true });
    // Igual que "nueva contrata"/renovar: se muestra la confirmación con la
    // opción de mandarle los detalles al cliente por WhatsApp en vez de
    // navegar de inmediato.
    setUnificada(data.nuevaContrata);
  }

  if (unificada) {
    return (
      <div className="space-y-4 md:max-w-xl">
        <ReciboEntregaPanel
          nombreApp={nombreApp}
          contrata={unificada}
          tituloPanel="Contratas unificadas"
          tituloMensaje="Detalles de tu reestructuración"
        />
        <Button variant="outline" className="w-full" asChild>
          <Link href={`/contratas/${unificada.id}`}>Ver la contrata nueva</Link>
        </Button>
        <Button variant="ghost" className="w-full" asChild>
          <Link href={`/clientes/${clienteId}`}>Volver al cliente</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/clientes/${clienteId}`}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Unificar contratas
        </h1>
        <p className="text-sm text-muted-foreground">{clienteNombre}</p>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Elige las contratas a unificar (mínimo 2)
          </p>
          <ul className="space-y-1.5">
            {contratas.map((c) => (
              <li key={c.id}>
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5">
                  <span className="text-sm">
                    {TIPO_LABEL[c.tipo]} · {formatMoneda(c.saldo)}
                  </span>
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={seleccionadas.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="font-medium">Saldo seleccionado</span>
            <span className="font-bold text-primary">
              {formatMoneda(saldoSeleccionado)}
            </span>
          </div>
          {saldoSeleccionado > 0 && (
            <p className="text-xs text-muted-foreground">
              Sugerencia: redondear a {formatMoneda(sugerencia)}
            </p>
          )}
        </CardContent>
      </Card>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo de la contrata nueva</Label>
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
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="monto">Monto nuevo</Label>
            <Input
              id="monto"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => {
                setMontoTocado(true);
                setMonto(e.target.value);
              }}
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
            <Label htmlFor="fecha">Primer pago</Label>
            <FechaInput
              id="fecha" value={fechaInicio} onChange={setFechaInicio} />
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

        <Card className={cubreDeuda ? "border-pagado/30" : "border-vencido/30"}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">
              {seleccionadas.size < 2
                ? "Selecciona al menos 2 contratas"
                : cubreDeuda
                  ? "Se entregará al cliente"
                  : "Falta cubrir"}
            </p>
            <p
              className={`text-2xl font-bold ${cubreDeuda ? "text-pagado" : "text-vencido"}`}
            >
              {seleccionadas.size >= 2
                ? formatMoneda(
                    cubreDeuda ? entregar : saldoSeleccionado - montoNum
                  )
                : "—"}
            </p>
          </CardContent>
        </Card>

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
                    {i + 1}. {format(new Date(f), "d MMM", { locale: es })}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          className="w-full"
          disabled={guardando || !cubreDeuda}
        >
          {guardando ? "Unificando…" : "Unificar contratas"}
        </Button>
      </form>
    </div>
  );
}
