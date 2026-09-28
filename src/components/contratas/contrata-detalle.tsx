"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  FileText,
  HandCoins,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EstadoBadge } from "@/components/estado-badge";
import { formatMoneda } from "@/lib/utils";
import { estadoContrata, haTerminadoPeriodo, saldoPendiente } from "@/lib/contrata";
import { enqueue } from "@/lib/offline/queue";
import { anclarFechaCliente } from "@/lib/fechas";
import { rutas } from "@/lib/rutas";

type PagoUI = {
  numeroCuota: number;
  fechaProgramada: string;
  fechaPago: string | null;
  pagado: boolean;
  montoAbonado: number;
};

type ContrataUI = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  tipo: TipoContrata;
  monto: number;
  abono: number;
  numCuotas: number;
  fechaInicio: string;
  notas: string | null;
  convertidaADeuda: boolean;
  creadoEn: string;
  pagos: PagoUI[];
};

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

function fecha(iso: string) {
  return format(anclarFechaCliente(iso), "d MMM yyyy", { locale: es });
}

export function ContrataDetalle({
  contrata,
  esAdmin,
  ownerId,
}: {
  contrata: ContrataUI;
  esAdmin: boolean;
  /** Presente cuando la página vive en la capa offline (ver repo/useLiveQuery). */
  ownerId?: string | null;
}) {
  const router = useRouter();
  const pagos = contrata.pagos;
  const convertida = contrata.convertidaADeuda;
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [montoAbono, setMontoAbono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marcandoDeuda, setMarcandoDeuda] = useState(false);
  const [mensajeDeuda, setMensajeDeuda] = useState<string | null>(null);

  // El prefetch automático de <Link> (al entrar en viewport) no siempre
  // alcanza a poblar la caché del service worker antes de que el usuario
  // toque el botón — sobre todo justo después de registrar un abono, que es
  // el momento típico de ir a ver el recibo. Forzarlo aquí (apenas se monta
  // la pantalla) asegura que "Ver recibo" funcione aunque se pierda la
  // conexión un segundo después.
  useEffect(() => {
    router.prefetch(rutas.contrataRecibo(contrata.id));
    router.prefetch(rutas.contrataEditar(contrata.id));
    router.prefetch(rutas.contrataRenovar(contrata.id));
  }, [router, contrata.id]);

  const estado = useMemo(
    () =>
      convertida
        ? "EN_DEUDA"
        : estadoContrata(
            pagos.map((p) => ({
              fechaProgramada: new Date(p.fechaProgramada),
              pagado: p.pagado,
            }))
          ),
    [pagos, convertida]
  );
  const saldo = useMemo(
    () =>
      saldoPendiente(
        pagos.map((p) => ({
          fechaProgramada: new Date(p.fechaProgramada),
          pagado: p.pagado,
          montoAbonado: p.montoAbonado,
        })),
        contrata.abono
      ),
    [pagos, contrata.abono]
  );
  const totalAbonado = useMemo(
    () => Math.round(pagos.reduce((s, p) => s + p.montoAbonado, 0) * 100) / 100,
    [pagos]
  );
  const terminoPeriodo = useMemo(
    () =>
      haTerminadoPeriodo(
        pagos.map((p) => ({
          fechaProgramada: new Date(p.fechaProgramada),
          pagado: p.pagado,
        }))
      ),
    [pagos]
  );
  const puedeMarcarDeuda =
    esAdmin && !convertida && saldo > 0 && terminoPeriodo;
  const puedeRenovar = esAdmin && !convertida && saldo > 0;

  function seleccionar(numeroCuota: number) {
    if (!esAdmin || cargando || convertida) return;
    if (seleccionada === numeroCuota) {
      setSeleccionada(null);
      return;
    }
    setSeleccionada(numeroCuota);
    setMontoAbono("");
    setError(null);
  }

  async function registrarAbono(numeroCuota: number, monto: number) {
    setCargando(true);
    setError(null);
    try {
      if (ownerId) {
        // Se aplica de inmediato en la caché local (optimista) y se encola
        // para el servidor — funciona con o sin conexión.
        await enqueue(ownerId, "contrata.pago.abonar", {
          contrataId: contrata.id,
          numeroCuota,
          monto,
        });
      } else {
        const res = await fetch(
          `/api/contratas/${contrata.id}/pagos/${numeroCuota}/abonar`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ monto }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo registrar el abono");
        }
      }
      setSeleccionada(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el abono");
    } finally {
      setCargando(false);
    }
  }

  async function pagarCompleto(numeroCuota: number) {
    const pago = pagos.find((p) => p.numeroCuota === numeroCuota);
    if (!pago) return;
    const pendiente = Math.round((contrata.abono - pago.montoAbonado) * 100) / 100;
    if (pendiente <= 0) return;
    await registrarAbono(numeroCuota, pendiente);
  }

  async function confirmarAbonoParcial(numeroCuota: number) {
    const monto = Number(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("Ingresa un monto válido");
      return;
    }
    await registrarAbono(numeroCuota, monto);
  }

  async function limpiar(numeroCuota: number) {
    setCargando(true);
    setError(null);
    try {
      if (ownerId) {
        await enqueue(ownerId, "contrata.pago.revertir", {
          contrataId: contrata.id,
          numeroCuota,
        });
      } else {
        const res = await fetch(
          `/api/contratas/${contrata.id}/pagos/${numeroCuota}/abonar`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("No se pudo revertir");
        router.refresh();
      }
      setSeleccionada(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revertir");
    } finally {
      setCargando(false);
    }
  }

  async function marcarComoDeuda() {
    const ok = confirm(
      `Vas a marcar el saldo pendiente (${formatMoneda(saldo)}) de ${contrata.clienteNombre} como deuda. La contrata dejará de contar como activa. ¿Confirmar?`
    );
    if (!ok) return;
    setMarcandoDeuda(true);
    setError(null);
    try {
      if (ownerId) {
        // Optimista: la contrata sale de la lista de activas de inmediato.
        // El detalle exacto de a qué deudor se sumó el saldo se sincroniza
        // en cuanto la operación se confirme con el servidor.
        await enqueue(ownerId, "contrata.marcarDeuda", { contrataId: contrata.id });
        setMensajeDeuda(
          "Marcado como deuda. Se sincronizará con Deudores en cuanto haya conexión."
        );
      } else {
        const res = await fetch(`/api/contratas/${contrata.id}/marcar-deuda`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo marcar como deuda");
        }
        const data = await res.json();
        setMensajeDeuda(
          `Se agregaron ${formatMoneda(data.montoTransferido)} a la deuda de ${data.deudorNombre} (deuda acumulada: ${formatMoneda(data.deudaAcumulada)}).`
        );
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar como deuda");
    } finally {
      setMarcandoDeuda(false);
    }
  }

  async function eliminar() {
    if (!confirm("¿Eliminar esta contrata? No se puede deshacer.")) return;
    setBorrando(true);
    if (ownerId) {
      try {
        await enqueue(ownerId, "contrata.eliminar", { contrataId: contrata.id });
      } catch (e) {
        setBorrando(false);
        alert(e instanceof Error ? e.message : "No se pudo eliminar");
        return;
      }
      router.push("/contratas");
      return;
    }
    const res = await fetch(`/api/contratas/${contrata.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/contratas");
      router.refresh();
    } else {
      setBorrando(false);
      alert("No se pudo eliminar.");
    }
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          // Una contrata se puede abrir desde /contratas O desde el
          // historial en el perfil del cliente — un href fijo a /contratas
          // (como antes) sacaba al usuario a la lista aunque hubiera
          // entrado desde el cliente. router.back() respeta de dónde vino
          // de verdad; /contratas solo como respaldo si no hay historial
          // (p. ej. se abrió el link directo).
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/contratas");
          }}
        >
          <ArrowLeft className="size-4" /> Volver
        </Button>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={rutas.contrataRecibo(contrata.id)}>
              <FileText className="size-4" /> Recibo
            </Link>
          </Button>
          {esAdmin && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={rutas.contrataEditar(contrata.id)}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={eliminar}
                disabled={borrando}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <Link
            href={rutas.cliente(contrata.clienteId)}
            className="text-2xl font-bold tracking-tight hover:underline"
          >
            {contrata.clienteNombre}
          </Link>
          <EstadoBadge estado={estado} />
        </div>
        <p className="text-sm text-muted-foreground">
          {TIPO_LABEL[contrata.tipo]} · inicio{" "}
          {fecha(contrata.fechaInicio)}
        </p>
        <p className="text-xs text-muted-foreground">
          Contrata entregada el {fecha(contrata.creadoEn)}
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Monto</p>
            <p className="text-sm font-semibold sm:text-base">
              {formatMoneda(contrata.monto)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Abono</p>
            <p className="text-sm font-semibold sm:text-base">
              {formatMoneda(contrata.abono)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Abonado</p>
            <p className="text-sm font-semibold text-pagado sm:text-base">
              {formatMoneda(totalAbonado)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className="text-sm font-semibold text-primary sm:text-base">
              {formatMoneda(saldo)}
            </p>
          </div>
        </CardContent>
      </Card>

      {contrata.notas && (
        <p className="text-sm text-muted-foreground">{contrata.notas}</p>
      )}

      {mensajeDeuda && (
        <Card className="border-pendiente/30">
          <CardContent className="p-4 text-sm">{mensajeDeuda}</CardContent>
        </Card>
      )}

      {puedeRenovar && (
        <Button variant="outline" className="w-full" asChild>
          <Link href={rutas.contrataRenovar(contrata.id)}>
            <RefreshCw className="size-4" /> Renovar contrata
          </Link>
        </Button>
      )}

      {puedeMarcarDeuda && (
        <div className="space-y-1.5">
          <Button
            variant="outline"
            className="w-full"
            disabled={marcandoDeuda}
            onClick={marcarComoDeuda}
          >
            <HandCoins className="size-4" />
            {marcandoDeuda
              ? "Marcando…"
              : `Marcar saldo (${formatMoneda(saldo)}) como deuda`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            El período de esta contrata ya terminó sin liquidarse. Esto suma
            el saldo a la deuda acumulada de {contrata.clienteNombre} en
            Deudores.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Cuotas
        </h2>
        <ul className="space-y-1.5">
          {pagos.map((p) => {
            const pendiente =
              Math.round((contrata.abono - p.montoAbonado) * 100) / 100;
            const esParcial = !p.pagado && p.montoAbonado > 0;
            return (
              <li key={p.numeroCuota}>
                <div
                  onClick={() => seleccionar(p.numeroCuota)}
                  className={`flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5 ${
                    esAdmin && !convertida
                      ? "cursor-pointer active:scale-[0.99]"
                      : ""
                  } ${
                    seleccionada === p.numeroCuota
                      ? "ring-2 ring-primary/40"
                      : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">
                      {p.numeroCuota}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {fecha(p.fechaProgramada)}
                      </p>
                      {p.montoAbonado > 0 && (
                        <p className="truncate text-xs text-muted-foreground">
                          Abonado {formatMoneda(p.montoAbonado)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {p.pagado ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-pagado">
                        <Check className="size-3.5" /> Pagado
                      </span>
                    ) : esParcial ? (
                      <span className="text-xs font-semibold text-amber-600">
                        Falta {formatMoneda(pendiente)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>
                {esAdmin && seleccionada === p.numeroCuota && (
                  <div className="mt-1.5 rounded-2xl border border-dashed border-border p-3">
                    {p.pagado && p.fechaPago && (
                      <p className="mb-2 text-xs text-muted-foreground">
                        Pagado el {fecha(p.fechaPago)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[140px] flex-1 space-y-1">
                        <label className="text-xs text-muted-foreground">
                          Monto del abono
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={montoAbono}
                          onChange={(e) => setMontoAbono(e.target.value)}
                          placeholder={`Pendiente ${formatMoneda(pendiente)}`}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={cargando}
                        onClick={() => confirmarAbonoParcial(p.numeroCuota)}
                      >
                        Abonar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cargando || pendiente <= 0}
                        onClick={() => pagarCompleto(p.numeroCuota)}
                      >
                        Pagar completo
                      </Button>
                      {p.montoAbonado > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={cargando}
                          onClick={() => limpiar(p.numeroCuota)}
                        >
                          Revertir
                        </Button>
                      )}
                    </div>
                    {error && (
                      <p className="mt-2 text-xs text-destructive">{error}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {esAdmin && !convertida && (
        <p className="text-center text-xs text-muted-foreground">
          Toca una cuota para registrar un abono (parcial o completo).
        </p>
      )}
    </div>
  );
}
