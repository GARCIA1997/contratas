"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calculator } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda, cn } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";

const TIPOS: { key: TipoContrata; label: string }[] = [
  { key: "SEMANAL", label: "Semanal" },
  { key: "QUINCENAL", label: "Quincenal" },
  { key: "MENSUAL", label: "Mensual" },
];

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalculadoraPrestamo({
  cuotasPorDefecto,
  maxCuotas,
}: {
  cuotasPorDefecto: number;
  maxCuotas: number;
}) {
  const [tipo, setTipo] = useState<TipoContrata>("SEMANAL");
  const [monto, setMonto] = useState("");
  const [numCuotas, setNumCuotas] = useState(cuotasPorDefecto);
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [abonoSugerido, setAbonoSugerido] = useState<number | null>(null);
  const [fechas, setFechas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0 || !fechaInicio || numCuotas < 1) {
      setAbonoSugerido(null);
      setFechas([]);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/contratas/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, monto: montoNum, fechaInicio, numCuotas }),
        });
        if (cancelado) return;
        if (!res.ok) throw new Error("No se pudo calcular");
        const data = await res.json();
        setAbonoSugerido(data.abonoSugerido);
        setFechas(data.fechas);
      } catch {
        if (!cancelado) setError("No se pudo calcular. Intenta de nuevo.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tipo, monto, fechaInicio, numCuotas]);

  const montoNum = parseFloat(monto) || 0;
  const totalAPagar = abonoSugerido ? abonoSugerido * numCuotas : 0;
  const interesTotal = abonoSugerido ? totalAPagar - montoNum : 0;
  const ultimaFecha = fechas.length > 0 ? fechas[fechas.length - 1] : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-full bg-muted p-1">
        {TIPOS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTipo(t.key)}
            className={cn(
              "flex-1 rounded-full py-1.5 text-center text-xs font-medium transition-colors sm:text-sm",
              tipo === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <Label htmlFor="calc-monto">Monto a prestar</Label>
            <Input
              id="calc-monto"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="calc-cuotas"># de cuotas</Label>
              <Input
                id="calc-cuotas"
                type="number"
                min={1}
                max={maxCuotas}
                value={numCuotas}
                onChange={(e) => setNumCuotas(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div>
              <Label htmlFor="calc-fecha">Fecha de inicio</Label>
              <Input
                id="calc-fecha"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {cargando && (
        <p className="text-center text-xs text-muted-foreground">
          Calculando…
        </p>
      )}
      {error && <p className="text-xs text-vencido">{error}</p>}

      {abonoSugerido !== null && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between border-b pb-3">
              <p className="text-sm text-muted-foreground">
                Abono sugerido por cuota
              </p>
              <p className="text-xl font-bold text-primary">
                {formatMoneda(abonoSugerido)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Total a pagar</p>
                <p className="text-sm font-semibold">
                  {formatMoneda(totalAPagar)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Interés estimado
                </p>
                <p className="text-sm font-semibold text-pagado">
                  {formatMoneda(interesTotal)}
                </p>
              </div>
            </div>
            {ultimaFecha && (
              <p className="text-xs text-muted-foreground">
                Última cuota:{" "}
                {format(anclarFechaCliente(ultimaFecha), "d 'de' MMMM yyyy", {
                  locale: es,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {abonoSugerido !== null && (
        <Button className="w-full" asChild>
          <Link href={`/contratas/nueva?tipo=${tipo}`}>
            <Calculator className="size-4" /> Crear esta contrata
          </Link>
        </Button>
      )}
    </div>
  );
}
