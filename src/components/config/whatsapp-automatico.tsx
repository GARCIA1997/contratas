"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { recordarReciboAutomatico } from "@/lib/whatsapp-auto/use-recibo-automatico";

type Cuenta = {
  numero: string;
  conectado: boolean;
  estado: string;
  activo: boolean;
  aceptoRiesgoEn: string | null;
  recibos: boolean;
  porVencer: boolean;
  vencidas: boolean;
  deudores: boolean;
  pausadaPorUsuario: boolean;
  pausadaPorAdmin: boolean;
  numeroManual: string | null;
  enviadosHoy: number;
  cupo: number;
  ultimoEnvio: string | null;
};

const TIPOS: { clave: "recibos" | "porVencer" | "vencidas" | "deudores"; texto: string; ayuda: string }[] = [
  { clave: "recibos", texto: "Recibos de cobro", ayuda: "Al guardarse el cobro en el servidor (también los capturados sin señal), a cualquier hora." },
  { clave: "porVencer", texto: "Cuota por vencer", ayuda: "El día que la cuota aparece en tu Ruta, de 9:00 a 19:00." },
  { clave: "vencidas", texto: "Cuota vencida", ayuda: "Una sola vez, el día siguiente a la fecha límite si no ha pagado." },
  { clave: "deudores", texto: "Recordatorio a deudores", ayuda: "Cada 15 días desde su último abono o recordatorio. Solo deudores con teléfono." },
];

const formatoTel = (t: string) => (t.length === 12 ? `+${t.slice(0, 2)} ${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8)}` : `+${t}`);

/**
 * "WhatsApp automático" en Configuración. Solo aparece si el administrador
 * ya le asignó un número a este espacio (desde el monitor). Aquí el usuario
 * enciende/apaga, elige qué se manda y pausa; no ve el historial ni puede
 * vincular o cambiar el número.
 */
export function WhatsAppAutomatico({ editable }: { editable: boolean }) {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const [cuenta, setCuenta] = useState<Cuenta | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aceptoRiesgo, setAceptoRiesgo] = useState(false);
  const [manual, setManual] = useState("");
  const [mismoNumero, setMismoNumero] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const c = (await r.json()) as Cuenta | null;
      setCuenta(c);
      setManual(c?.numeroManual ?? "");
    } catch {
      setCuenta(null);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(cambio: Record<string, unknown>) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/whatsapp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambio),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "No se pudo guardar");
      setCuenta(j);
      // Las pantallas de cobro dejan de ofrecer (o vuelven a ofrecer) el recibo manual.
      if (ownerId) recordarReciboAutomatico(ownerId, j);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar (¿sin señal?)");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  if (!cuenta) return null;

  const soloDigitos = manual.replace(/\D/g, "");
  const manualIgualAutomatico =
    soloDigitos.length >= 10 && cuenta.numero.endsWith(soloDigitos.slice(-10));

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">WhatsApp automático</h2>
      <Card>
        <CardContent className="space-y-4 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <MessageCircle className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{formatoTel(cuenta.numero)}</div>
                <div className={cn("text-xs", cuenta.conectado ? "text-emerald-600" : "text-amber-600")}>
                  {cuenta.conectado ? "Conectado" : "No conectado (lo vincula el administrador)"}
                  {cuenta.pausadaPorAdmin && " · Pausado por el administrador"}
                  {cuenta.pausadaPorUsuario && " · Pausado por ti"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Hoy: {cuenta.enviadosHoy}/{cuenta.cupo} mensajes
                  {cuenta.ultimoEnvio && ` · último envío ${new Date(cuenta.ultimoEnvio).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`}
                </div>
              </div>
            </div>
            <Switch
              checked={cuenta.activo}
              disabled={!editable || guardando || (!cuenta.activo && !cuenta.conectado)}
              etiqueta="Habilitar WhatsApp automático"
              onChange={(v) => {
                if (v && !cuenta.aceptoRiesgoEn) setConfirmando(true);
                else void guardar({ activo: v });
              }}
            />
          </div>

          {confirmando && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p>
                Los mensajes salen solos desde este número usando una conexión <b>no oficial</b> de WhatsApp.
                WhatsApp puede <b>bloquear el número</b>. Se reduce el riesgo (máximo 100 al día, pausas,
                baja con “NO”), pero no desaparece.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={aceptoRiesgo} onChange={(e) => setAceptoRiesgo(e.target.checked)} />
                Entiendo y acepto el riesgo de bloqueo del número.
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!aceptoRiesgo || guardando}
                  onClick={async () => {
                    if (await guardar({ activo: true, aceptoRiesgo: true })) setConfirmando(false);
                  }}
                >
                  Habilitar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {cuenta.activo && (
            <>
              <div className="space-y-3">
                {TIPOS.map((t) => (
                  <div key={t.clave} className="flex items-start justify-between gap-3">
                    <div>
                      <div>{t.texto}</div>
                      <div className="text-xs text-muted-foreground">{t.ayuda}</div>
                    </div>
                    <Switch
                      checked={cuenta[t.clave]}
                      disabled={!editable || guardando}
                      etiqueta={t.texto}
                      onChange={(v) => void guardar({ [t.clave]: v })}
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!editable || guardando}
                onClick={() => void guardar({ pausada: !cuenta.pausadaPorUsuario })}
              >
                {cuenta.pausadaPorUsuario ? <Play className="size-4" /> : <Pause className="size-4" />}
                {cuenta.pausadaPorUsuario ? "Reanudar envíos" : "Pausar envíos"}
              </Button>
              {cuenta.pausadaPorAdmin && (
                <p className="text-xs text-muted-foreground">
                  El administrador pausó los envíos; solo él puede reanudarlos.
                </p>
              )}
            </>
          )}

          <div className="space-y-2 border-t pt-3">
            <label className="block text-xs text-muted-foreground" htmlFor="wa-manual">
              Número desde el que envías a mano (solo informativo)
            </label>
            <div className="flex gap-2">
              <input
                id="wa-manual"
                inputMode="tel"
                value={manual}
                disabled={!editable}
                onChange={(e) => {
                  setManual(e.target.value);
                  setMismoNumero(false);
                }}
                className="h-9 flex-1 rounded-md border bg-background px-2"
                placeholder="312 000 0000"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!editable || guardando || (manualIgualAutomatico && !mismoNumero)}
                onClick={() => void guardar({ numeroManual: manual.trim() || null, confirmoMismoNumero: mismoNumero })}
              >
                Guardar
              </Button>
            </div>
            {manualIgualAutomatico && (
              <label className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <input type="checkbox" checked={mismoNumero} onChange={(e) => setMismoNumero(e.target.checked)} />
                Es el mismo número que el automático. Entiendo que si WhatsApp lo bloquea, tampoco podré enviar a mano desde él.
              </label>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Switch({
  checked,
  disabled,
  etiqueta,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  etiqueta: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
