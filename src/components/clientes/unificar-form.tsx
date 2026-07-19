"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";

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
  clienteNombre,
  contratas,
  cuotasPorDefecto,
  maxCuotas,
}: {
  clienteId: string;
  clienteNombre: string;
  contratas: ContrataElegible[];
  cuotasPorDefecto: number;
  maxCuotas: number;
}) {
  const router = useRouter();
  const claims = useAuthClaims();
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<TipoContrata>(contratas[0]?.tipo ?? "SEMANAL");
  const [monto, setMonto] = useState("");
  const [montoTocado, setMontoTocado] = useState(false);
  const [numCuotas, setNumCuotas] = useState(cuotasPorDefecto);
  const [fechaInicio, setFechaInicio] = useState(
    new Date().toISOString().slice(0, 10)
  );
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
    return () => {
      cancelado = true;
    };
  }, [tipo, montoNum, fechaInicio, numCuotas]);

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

    setGuardando(true);
    const res = await fetch(`/api/clientes/${clienteId}/unificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contrataIds: Array.from(seleccionadas),
        tipo,
        monto: montoNum,
        abono: abonoNum,
        fechaInicio,
        numCuotas,
        notas: notas.trim() || null,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo unificar");
      return;
    }
    const data = await res.json();
    if (claims.ready && claims.ownerId) await syncAll(claims.ownerId);
    router.push(`/contratas/${data.nuevaContrata.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
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
