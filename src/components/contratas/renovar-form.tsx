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
import { anclarFechaCliente } from "@/lib/fechas";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

type OtraContrata = { id: string; tipo: TipoContrata; saldo: number };

export function RenovarForm({
  contrataId,
  clienteNombre,
  tipoOriginal,
  saldoOriginal,
  otras,
  cuotasPorDefecto,
  maxCuotas,
}: {
  contrataId: string;
  clienteNombre: string;
  tipoOriginal: TipoContrata;
  saldoOriginal: number;
  otras: OtraContrata[];
  cuotasPorDefecto: number;
  maxCuotas: number;
}) {
  const router = useRouter();
  const [incluirOtras, setIncluirOtras] = useState(false);
  const [tipo, setTipo] = useState<TipoContrata>(tipoOriginal);
  const [monto, setMonto] = useState("");
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

    setGuardando(true);
    const res = await fetch(`/api/contratas/${contrataId}/renovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        monto: montoNum,
        abono: abonoNum,
        fechaInicio,
        numCuotas,
        notas: notas.trim() || null,
        incluirOtras,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo renovar");
      return;
    }
    const data = await res.json();
    router.push(`/contratas/${data.nuevaContrata.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
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
                  Incluir también lo vencido/vigente de{" "}
                  {otras.length === 1
                    ? "su otra contrata activa"
                    : `sus otras ${otras.length} contratas activas`}{" "}
                  ({formatMoneda(saldoOtras)}) — solo se cubre la cuota en
                  curso más atrasadas, el resto sigue activo
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
