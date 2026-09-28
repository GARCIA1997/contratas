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
import { syncAll } from "@/lib/offline/sync";
import { obtenerPreview, prepararEntregaLocal } from "@/lib/offline/entrega-local";
import { guardarOperacion } from "@/lib/offline/guardar";
import { mensajeDeError } from "@/lib/offline/conexion";
import type { ResultadoRenovacion } from "@/components/contratas/renovar-form";
import { useIdempotencia } from "@/lib/offline/use-idempotencia";
import {
  ReciboEntregaPanel,
  type ContrataEntregada,
} from "@/components/contratas/recibo-entrega";
import { usePrimerPago } from "@/lib/offline/use-primer-pago";
import { rutas } from "@/lib/rutas";

type DatosUnificacion = {
  tipo: TipoContrata;
  monto: number;
  abono: number;
  fechaInicio: string;
  numCuotas: number;
  notas: string | null;
};

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
  /** Cita que se está entregando: su enlace con la contrata nueva va en la
   *  misma operación de guardado (ver guardar.ts), nunca por separado. */
  citaId?: string | null;
  /** Se llama antes de guardar: la página no debe redirigir al ver las elegidas liquidadas. */
  onUnificada?: () => void;
}) {
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
    const input: DatosUnificacion = {
      tipo,
      monto: montoNum,
      abono: abonoNum,
      fechaInicio,
      numCuotas,
      notas: notas.trim() || null,
    };

    setGuardando(true);
    try {
      await guardarUnificacion(contrataIds, input);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo unificar"));
    } finally {
      setGuardando(false);
    }
  }

  /** Igual que renovar (ver renovar-form.tsx): una sola operación, idéntica por ambos caminos. */
  async function guardarUnificacion(contrataIds: string[], input: DatosUnificacion) {
    const id = crypto.randomUUID();
    const hoy = new Date();
    const entrega = ownerId
      ? await prepararEntregaLocal(ownerId, {
          id,
          clienteId,
          input,
          hoy,
          liquidarCompletas: contrataIds,
        })
      : null;

    // Antes de guardar: la página redirige si deja de ver contratas
    // elegibles y no sabe que esto fue una unificación.
    onUnificada?.();

    const r = await guardarOperacion<ResultadoRenovacion>({
      ownerId,
      clave: idem.clave(),
      lote: [
        {
          type: "cliente.unificar",
          payload: {
            clienteId,
            contrataIds,
            input: { ...input, id, fechaCaptura: hoy.toISOString() },
            ...(entrega ? { _local: entrega.filas } : {}),
          },
        },
        ...(citaId
          ? [{ type: "cita.entregar" as const, payload: { citaId, contrataCreadaId: id } }]
          : []),
      ],
    });
    idem.confirmado();
    if (r.enServidor) {
      if (ownerId) await syncAll(ownerId, { forzar: true });
      setUnificada(r.datos.nuevaContrata);
    } else {
      setUnificada(entrega!.recibo);
    }
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
          <Link href={rutas.contrata(unificada.id)}>Ver la contrata nueva</Link>
        </Button>
        <Button variant="ghost" className="w-full" asChild>
          <Link href={rutas.cliente(clienteId)}>Volver al cliente</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={rutas.cliente(clienteId)}>
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
