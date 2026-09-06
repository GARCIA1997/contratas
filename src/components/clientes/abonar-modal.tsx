"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { HandCoins, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popup } from "@/components/ui/popup";
import { formatMoneda } from "@/lib/utils";
import { distribuirAbono, type ResultadoAbono } from "@/lib/services/abono";
import { getContratasParaAbono } from "@/lib/offline/repo";
import { enqueue } from "@/lib/offline/queue";
import { syncContratas } from "@/lib/offline/sync";
import { linkWhatsApp } from "@/lib/whatsapp";
import { mensajeCobro } from "@/lib/mensajes-whatsapp";
import {
  calidadConexion,
  fetchConTimeout,
  mensajeDeError,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";

const TIPO_LABEL: Record<string, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

/**
 * Botón "Abonar" + modal de reparto automático — beta temporal (ver
 * `lib/beta.ts`). Reusable desde el perfil del cliente y desde Ruta: no
 * depende de qué pantalla lo abrió, carga su propio estado de contratas
 * vía `getContratasParaAbono` (funciona con o sin señal, siempre desde
 * Dexie).
 *
 * El reparto (`distribuirAbono`) se calcula EN EL NAVEGADOR en cada tecla
 * del monto, antes de confirmar nada — así el cobrador ve exactamente a
 * dónde va su dinero antes de aplicarlo, y ese mismo cálculo se reusa como
 * recibo tanto si hay señal como si no.
 */
export function AbonarModal({
  clienteId,
  ownerId,
  nombreApp,
  clienteNombre,
  telefono,
}: {
  clienteId: string;
  ownerId: string;
  nombreApp: string;
  clienteNombre: string;
  telefono: string | null;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAbono | null>(null);
  const [offlinePendiente, setOfflinePendiente] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  useEffect(() => setMontado(true), []);

  const contratas = useLiveQuery(
    () => (abierto ? getContratasParaAbono(ownerId, clienteId) : undefined),
    [abierto, ownerId, clienteId]
  );

  const montoNum = Number(monto) || 0;
  const preview = useMemo(
    () => (contratas && montoNum > 0 ? distribuirAbono(contratas, montoNum) : null),
    [contratas, montoNum]
  );

  function cerrar() {
    setAbierto(false);
    setMonto("");
    setError(null);
    setResultado(null);
    setOfflinePendiente(false);
    setIdempotencyKey(null);
  }

  async function confirmar() {
    if (!preview || preview.aplicaciones.length === 0) return;
    setCargando(true);
    setError(null);
    try {
      if (calidadConexion() === "sin-red") {
        // El reparto ya se calculó arriba (preview) contra los mismos datos
        // que aplicará el efecto optimista — se reusa tal cual como recibo,
        // sin recalcular nada.
        await enqueue(ownerId, "cliente.abonarParcial", { clienteId, monto: montoNum });
        setOfflinePendiente(true);
        setResultado(preview);
        return;
      }
      const key = idempotencyKey ?? crypto.randomUUID();
      setIdempotencyKey(key);
      const res = await fetchConTimeout(
        `/api/clientes/${clienteId}/abonar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ monto: montoNum }),
        },
        TIMEOUT_ESCRITURA_MS
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo registrar el abono");
      }
      const data: ResultadoAbono = await res.json();
      setResultado(data);
      await syncContratas(ownerId);
      router.refresh();
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo registrar el abono"));
    } finally {
      setCargando(false);
    }
  }

  const mensaje = resultado
    ? mensajeCobro({
        nombreApp,
        clienteNombre,
        total: resultado.totalAplicado,
        contratas: resultado.contratas.map((c) => ({
          tipo: c.tipo,
          numCuotas: c.numCuotas,
          cuotas: c.cuotas,
          subtotal: c.subtotal,
        })),
      })
    : null;

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setAbierto(true)}>
        <HandCoins className="size-4" /> Abonar
      </Button>

      {/* Portal a document.body: este botón vive dentro de una Card, que
          usa `.glass-card` (`backdrop-filter`) — eso crea un containing
          block nuevo para hijos `position: fixed` y el Popup quedaba
          atrapado dentro de la tarjeta en vez de cubrir la pantalla (mismo
          bug ya documentado para el modal de confirmar cobro en Ruta). */}
      {montado &&
        createPortal(
          <Popup open={abierto} onClose={cerrar} className="max-w-sm text-left">
            {resultado ? (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">
                    {offlinePendiente ? "Abono registrado sin conexión" : "Abono registrado"}
                  </p>
                  <p className="text-2xl font-bold text-pagado">
                    {formatMoneda(resultado.totalAplicado)}
                  </p>
                  {offlinePendiente && (
                    <p className="text-xs text-muted-foreground">
                      Se sincroniza solo en cuanto haya señal. El recibo ya se puede
                      enviar.
                    </p>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {resultado.contratas.map((c) => (
                    <li
                      key={c.contrataId}
                      className="rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {TIPO_LABEL[c.tipo]}
                          {c.montoContrata !== undefined && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {formatMoneda(c.montoContrata)}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold">{formatMoneda(c.subtotal)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.cuotas
                          .map((q) => `Cuota ${q.numeroCuota}/${c.numCuotas}`)
                          .join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" asChild>
                  <a
                    href={linkWhatsApp(telefono, mensaje ?? "")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="size-4" /> Enviar recibo por WhatsApp
                  </a>
                </Button>
                <Button variant="ghost" className="w-full" onClick={cerrar}>
                  Cerrar
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Registrar abono — {clienteNombre}</p>
                <div className="space-y-2 text-left">
                  <Label htmlFor="monto-abono">¿Cuánto te dio?</Label>
                  <Input
                    id="monto-abono"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    autoFocus
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                  />
                </div>

                {contratas === undefined && (
                  <p className="text-center text-xs text-muted-foreground">Cargando…</p>
                )}

                {preview && (
                  <div className="space-y-2">
                    {preview.contratas.length > 0 ? (
                      <ul className="space-y-1.5">
                        {preview.contratas.map((c) => (
                          <li
                            key={c.contrataId}
                            className="rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {TIPO_LABEL[c.tipo]}
                                {c.montoContrata !== undefined && (
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    · {formatMoneda(c.montoContrata)}
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold">{formatMoneda(c.subtotal)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {c.cuotas
                                .map((q) => `Cuota ${q.numeroCuota}/${c.numCuotas}`)
                                .join(", ")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-center text-xs text-muted-foreground">
                        Este cliente no tiene cuotas pendientes.
                      </p>
                    )}
                    {preview.sobranteNoAplicado > 0 && (
                      <p className="text-center text-xs text-destructive">
                        Este monto es mayor a todo lo que el cliente debe — sobran{" "}
                        {formatMoneda(preview.sobranteNoAplicado)}. Revisa la cantidad.
                      </p>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-center text-xs text-destructive">{error}</p>
                )}

                <Button
                  className="w-full"
                  disabled={
                    cargando ||
                    !preview ||
                    preview.aplicaciones.length === 0 ||
                    preview.sobranteNoAplicado > 0
                  }
                  onClick={confirmar}
                >
                  {cargando ? "Registrando…" : "Confirmar abono"}
                </Button>
                <Button variant="ghost" className="w-full" onClick={cerrar}>
                  Cancelar
                </Button>
              </div>
            )}
          </Popup>,
          document.body
        )}
    </>
  );
}
