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
import { anclarFechaCliente } from "@/lib/fechas";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";
import { enqueue } from "@/lib/offline/queue";
import {
  fetchConTimeout,
  mensajeDeError,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";
import { useIdempotencia } from "@/lib/offline/use-idempotencia";
import {
  ReciboEntregaPanel,
  type ContrataEntregada,
} from "@/components/contratas/recibo-entrega";
import { ReciboOtrasLiquidadasPanel } from "@/components/contratas/recibo-otras-liquidadas";
import type { ContrataResumenCobro } from "@/lib/services/cobros";
import { usePrimerPago } from "@/lib/offline/use-primer-pago";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

type OtraContrata = { id: string; tipo: TipoContrata; saldo: number };

export function RenovarForm({
  contrataId,
  ownerId,
  clienteNombre,
  tipoOriginal,
  saldoOriginal,
  otras,
  cuotasPorDefecto,
  maxCuotas,
  nombreApp,
  onRenovada,
}: {
  contrataId: string;
  /** Presente cuando la página vive en la capa offline (ver repo/useLiveQuery). */
  ownerId?: string | null;
  clienteNombre: string;
  tipoOriginal: TipoContrata;
  saldoOriginal: number;
  otras: OtraContrata[];
  cuotasPorDefecto: number;
  maxCuotas: number;
  nombreApp: string;
  /** La página la usa para no redirigir de vuelta apenas la original quede
   * liquidada — ver comentario en el page.tsx. Recibe el id de la contrata
   * nueva (null si se guardó offline, sin id todavía) y si fue offline —
   * usado por la página de "convertir cita en contrata" para cerrar el
   * círculo marcando la cita como entregada; el resto de los llamadores
   * ignora el argumento. */
  onRenovada?: (info?: { contrataId: string | null; offline: boolean }) => void;
}) {
  const claims = useAuthClaims();
  const idem = useIdempotencia();
  const [incluirOtras, setIncluirOtras] = useState(false);
  const [pendienteSync, setPendienteSync] = useState(false);
  const [renovada, setRenovada] = useState<ContrataEntregada & { id: string } | null>(
    null
  );
  const [otrasLiquidadas, setOtrasLiquidadas] = useState<ContrataResumenCobro[]>(
    []
  );
  const [tipo, setTipo] = useState<TipoContrata>(tipoOriginal);
  const [monto, setMonto] = useState("");
  const [numCuotas, setNumCuotas] = useState(cuotasPorDefecto);
  const [fechaInicio, setFechaInicio] = usePrimerPago(tipo);
  const [abono, setAbono] = useState("");
  const [notas, setNotas] = useState("");
  const abonoTocado = useRef(false);
  const [fechas, setFechas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const saldoOtras = otras.reduce((s, c) => s + c.saldo, 0);
  const saldoTotal =
    Math.round((saldoOriginal + (incluirOtras ? saldoOtras : 0)) * 100) / 100;
  const montoNum = parseFloat(monto) || 0;
  const entregar = Math.round((montoNum - saldoTotal) * 100) / 100;
  const cubreDeuda = montoNum >= saldoTotal && montoNum > 0;

  useEffect(() => {
    if (!montoNum || montoNum <= 0 || !fechaInicio || numCuotas < 1) {
      setFechas([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const res = await fetchConTimeout("/api/contratas/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo, monto: montoNum, fechaInicio, numCuotas }),
          });
          if (!res.ok || cancelado) return;
          const data = await res.json();
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
  }, [tipo, montoNum, fechaInicio, numCuotas]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const abonoNum = parseFloat(abono);
    if (!montoNum || montoNum <= 0) return setError("Monto inválido");
    if (!abonoNum || abonoNum <= 0) return setError("Abono inválido");
    if (!cubreDeuda)
      return setError(
        `El monto debe cubrir el saldo pendiente (${formatMoneda(saldoTotal)})`
      );

    const input = {
      tipo,
      monto: montoNum,
      abono: abonoNum,
      fechaInicio,
      numCuotas,
      notas: notas.trim() || null,
      incluirOtras,
    };

    setGuardando(true);

    // Renovar crea una contrata nueva — sin conexión no se conoce su id
    // todavía, así que se encola y se avisa "pendiente" en vez de navegar a
    // una pantalla que no existe hasta que el servidor confirme. Si hay
    // señal real se guarda directo (antes se encolaba siempre, con o sin
    // conexión, y mostraba el aviso de "pendiente" aunque hubiera internet).
    const sinConexion = typeof navigator !== "undefined" && !navigator.onLine;
    if (ownerId && sinConexion) {
      await enqueue(ownerId, "contrata.renovar", {
        contrataId,
        otrasIds: incluirOtras ? otras.map((o) => o.id) : [],
        input,
      });
      setGuardando(false);
      setPendienteSync(true);
      onRenovada?.({ contrataId: null, offline: true });
      return;
    }

    let res: Response;
    try {
      res = await fetchConTimeout(
        `/api/contratas/${contrataId}/renovar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...idem.header() },
          body: JSON.stringify(input),
        },
        TIMEOUT_ESCRITURA_MS
      );
    } catch (e) {
      setGuardando(false);
      setError(mensajeDeError(e, "No se pudo renovar"));
      return;
    }
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo renovar");
      return;
    }
    idem.confirmado();
    const data = await res.json();
    // onRenovada() (marca "completado" en la página) va ANTES de syncAll:
    // syncAll escribe en Dexie, y el useLiveQuery de la página reacciona a
    // ese cambio con su propio re-render — si ese re-render llega a correr
    // antes de que React procese el setState de "completado", el efecto de
    // redirect de la página alcanza a dispararse con el flag todavía en
    // false y saca al usuario del panel de confirmación antes de que se
    // alcance a mostrar.
    onRenovada?.({ contrataId: data.nuevaContrata.id, offline: false });
    if (claims.ready && claims.ownerId) await syncAll(claims.ownerId, { forzar: true });
    // Igual que "nueva contrata": se muestra la confirmación con la opción
    // de mandarle los detalles al cliente por WhatsApp (mismo detalle
    // completo, calendario incluido) en vez de navegar de inmediato.
    setOtrasLiquidadas(data.otrasLiquidadas ?? []);
    setRenovada(data.nuevaContrata);
  }

  if (renovada) {
    return (
      <div className="space-y-4 md:max-w-xl">
        <ReciboEntregaPanel
          nombreApp={nombreApp}
          contrata={renovada}
          tituloPanel="Contrata renovada"
          tituloMensaje="Detalles de tu renovación"
        />
        <ReciboOtrasLiquidadasPanel
          nombreApp={nombreApp}
          clienteNombre={renovada.cliente.nombre}
          clienteTelefono={renovada.cliente.telefono}
          otrasLiquidadas={otrasLiquidadas}
        />
        <Button variant="outline" className="w-full" asChild>
          <Link href={`/contratas/${renovada.id}`}>Ver la contrata nueva</Link>
        </Button>
        <Button variant="ghost" className="w-full" asChild>
          <Link href={`/contratas/${contrataId}`}>Volver a la contrata original</Link>
        </Button>
      </div>
    );
  }

  if (pendienteSync) {
    return (
      <div className="space-y-4 md:max-w-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Renovación pendiente
          </h1>
          <p className="text-sm text-muted-foreground">{clienteNombre}</p>
        </div>
        <Card className="border-pendiente/30">
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              Sin conexión — la renovación se aplicará sola en cuanto el
              dispositivo vuelva a tener señal. No hace falta hacer nada
              más.
            </p>
          </CardContent>
        </Card>
        <Button className="w-full" asChild>
          <Link href={`/contratas/${contrataId}`}>Volver a la contrata</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/contratas/${contrataId}`}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Renovar contrata</h1>
        <p className="text-sm text-muted-foreground">{clienteNombre}</p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Saldo de esta contrata ({TIPO_LABEL[tipoOriginal]})
            </span>
            <span className="font-semibold">{formatMoneda(saldoOriginal)}</span>
          </div>

          {otras.length > 0 && (
            <>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-3">
                <span className="text-sm">
                  Incluir también lo vencido, vigente o próximo a vencer de
                  {" "}
                  {otras.length === 1
                    ? "su otra contrata activa"
                    : `sus otras ${otras.length} contratas activas`}{" "}
                  ({formatMoneda(saldoOtras)}) — solo se cubren esas cuotas,
                  el resto sigue activo
                </span>
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-primary"
                  checked={incluirOtras}
                  onChange={(e) => setIncluirOtras(e.target.checked)}
                />
              </label>
              {incluirOtras && (
                <ul className="space-y-1 pl-1 text-xs text-muted-foreground">
                  {otras.map((c) => (
                    <li key={c.id} className="flex justify-between">
                      <span>{TIPO_LABEL[c.tipo]}</span>
                      <span>{formatMoneda(c.saldo)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="font-medium">Total a cubrir</span>
            <span className="font-bold text-primary">
              {formatMoneda(saldoTotal)}
            </span>
          </div>
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
              {cubreDeuda ? "Se entregará al cliente" : "Falta cubrir"}
            </p>
            <p
              className={`text-2xl font-bold ${cubreDeuda ? "text-pagado" : "text-vencido"}`}
            >
              {formatMoneda(cubreDeuda ? entregar : saldoTotal - montoNum)}
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
                    {i + 1}. {format(anclarFechaCliente(f), "d MMM", { locale: es })}
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
          {guardando ? "Renovando…" : "Renovar contrata"}
        </Button>
      </form>
    </div>
  );
}
