"use client";

import { modoLocalActivo } from "@/lib/offline/modo-local";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ModoQuincenal } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { ConfigView } from "@/lib/config";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncConfiguracion } from "@/lib/offline/sync";

export function ConfigForm({
  inicial,
  soloLectura,
}: {
  inicial: ConfigView;
  soloLectura: boolean;
}) {
  const router = useRouter();
  const claims = useAuthClaims();
  const [c, setC] = useState({
    tasaSemanal: String(inicial.tasaSemanal),
    tasaQuincenal: String(inicial.tasaQuincenal),
    tasaMensual: String(inicial.tasaMensual),
    cuotasPorDefecto: String(inicial.cuotasPorDefecto),
    maxCuotas: String(inicial.maxCuotas),
    modoFechasQuincenal: inicial.modoFechasQuincenal as ModoQuincenal,
    diaCobroSemanal: String(inicial.diaCobroSemanal),
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function set<K extends keyof typeof c>(k: K, v: (typeof c)[K]) {
    setC((prev) => ({ ...prev, [k]: v }));
    setOk(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (modoLocalActivo()) return setError("Enciende la sincronización para hacer este cambio.");
    setGuardando(true);
    const res = await fetch("/api/configuracion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Marca fija de la app: no editable desde aquí.
        nombreApp: inicial.nombreApp,
        colorPrimario: inicial.colorPrimario,
        logoUrl: inicial.logoUrl,
        tasaSemanal: parseFloat(c.tasaSemanal) || 0,
        tasaQuincenal: parseFloat(c.tasaQuincenal) || 0,
        tasaMensual: parseFloat(c.tasaMensual) || 0,
        cuotasPorDefecto: parseInt(c.cuotasPorDefecto) || 1,
        maxCuotas: parseInt(c.maxCuotas) || 1,
        modoFechasQuincenal: c.modoFechasQuincenal,
        diaCobroSemanal: parseInt(c.diaCobroSemanal),
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    if (claims.ready && claims.ownerId) await syncConfiguracion(claims.ownerId);
    setOk(true);
    router.refresh();
  }

  const disabled = soloLectura || guardando;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <Label className="mb-2 block">Tasas de interés</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="tasaSemanal" className="text-xs font-normal text-muted-foreground">
                  Semanal
                </Label>
                <Input
                  id="tasaSemanal"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={c.tasaSemanal}
                  onChange={(e) => set("tasaSemanal", e.target.value)}
                  disabled={disabled}
                  className="px-2 text-center"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tasaQuincenal" className="text-xs font-normal text-muted-foreground">
                  Quincenal
                </Label>
                <Input
                  id="tasaQuincenal"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={c.tasaQuincenal}
                  onChange={(e) => set("tasaQuincenal", e.target.value)}
                  disabled={disabled}
                  className="px-2 text-center"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tasaMensual" className="text-xs font-normal text-muted-foreground">
                  Mensual
                </Label>
                <Input
                  id="tasaMensual"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={c.tasaMensual}
                  onChange={(e) => set("tasaMensual", e.target.value)}
                  disabled={disabled}
                  className="px-2 text-center"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Interés por cada $1,000 prestados, calculado para un plazo de{" "}
              <strong>{c.cuotasPorDefecto || inicial.cuotasPorDefecto} pagos</strong>.
              Si al crear una contrata se pactan más o menos cuotas, el interés
              total sube o baja en la misma proporción (p. ej. el doble de
              plazo paga el doble de interés) — no se reparte el mismo
              interés entre más pagos.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cuotasPorDefecto" className="text-xs font-normal text-muted-foreground">
                Cuotas por defecto
              </Label>
              <Input
                id="cuotasPorDefecto"
                type="number"
                inputMode="numeric"
                min="1"
                max="52"
                value={c.cuotasPorDefecto}
                onChange={(e) => set("cuotasPorDefecto", e.target.value)}
                disabled={disabled}
                className="text-center"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxCuotas" className="text-xs font-normal text-muted-foreground">
                Máximo de cuotas
              </Label>
              <Input
                id="maxCuotas"
                type="number"
                inputMode="numeric"
                min="1"
                max="52"
                value={c.maxCuotas}
                onChange={(e) => set("maxCuotas", e.target.value)}
                disabled={disabled}
                className="text-center"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            «Cuotas por defecto» también es el plazo de referencia de las
            tasas de interés de arriba.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="modo" className="text-xs font-normal text-muted-foreground">
              Modo fechas quincenales
            </Label>
            <Select
              id="modo"
              value={c.modoFechasQuincenal}
              onChange={(e) =>
                set("modoFechasQuincenal", e.target.value as ModoQuincenal)
              }
              disabled={disabled}
            >
              <option value="QUINCE_DIAS">Cada 15 días</option>
              <option value="DIAS_1_Y_15">Días 1 y 15 del mes</option>
              <option value="DIAS_15_Y_ULTIMO">Días 15 y último del mes</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="diaCobroSemanal" className="text-xs font-normal text-muted-foreground">
              Día de cobro semanal
            </Label>
            <Select
              id="diaCobroSemanal"
              value={c.diaCobroSemanal}
              onChange={(e) => set("diaCobroSemanal", e.target.value)}
              disabled={disabled}
            >
              <option value="1">Lunes</option>
              <option value="2">Martes</option>
              <option value="3">Miércoles</option>
              <option value="4">Jueves</option>
              <option value="5">Viernes</option>
              <option value="6">Sábado</option>
              <option value="0">Domingo</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              Las contratas semanales nuevas se alinean para que todas sus
              cuotas caigan en este día.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {ok && <p className="text-sm text-pagado">Configuración guardada.</p>}

      {!soloLectura && (
        <Button type="submit" className="w-full" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar configuración"}
        </Button>
      )}
    </form>
  );
}
