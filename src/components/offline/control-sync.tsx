"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  Loader2,
  Clock,
  Signal,
  SignalLow,
  Smartphone,
} from "lucide-react";
import { useEstadoSync } from "@/lib/offline/use-estado-sync";
import { resumirEstado, type Icono, type Tono } from "@/lib/offline/resumen-sync";
import {
  descargaCompleta,
  descargarParaModoLocal,
  entrarAModoLocal,
  sincronizarAhora,
  type ProgresoDescarga,
  type ReporteDescarga,
  type ResultadoSincronizacion,
} from "@/lib/offline/modo-local-flujo";
import { calidadConexion } from "@/lib/offline/conexion";
import { PanelSync } from "@/components/offline/panel-sync";
import { cn } from "@/lib/utils";

/**
 * Control único de sincronización del encabezado.
 *
 * Reemplaza a tres controles que competían por lo mismo (indicador de
 * pendientes, switch de modo local y botón de recargar): con los tres, un
 * cobrador podía disparar tres envíos a la vez, ver "Sincronizando" y
 * "Local" al mismo tiempo, o no entender por qué "Reintentar" estaba
 * deshabilitado. Aquí el botón solo INFORMA el estado; todas las acciones
 * viven en un panel, una a la vez y con su explicación.
 */

export type Descarga =
  | { etapa: "en-curso"; progreso: ProgresoDescarga }
  | { etapa: "revisar"; reporte: ReporteDescarga };

export function ControlSync({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const estado = useEstadoSync(ownerId);
  const [abierto, setAbierto] = useState(false);
  const [descarga, setDescarga] = useState<Descarga | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSincronizacion | null>(null);
  const cancelado = useRef(false);

  const pct =
    descarga?.etapa === "en-curso"
      ? porcentaje(descarga.progreso)
      : null;
  const resumen = resumirEstado(estado, pct === null ? null : { pct });

  /** Apagar la sincronización: preparar el teléfono y, si quedó listo, entrar a modo local. */
  async function prepararYApagar() {
    setResultado(null);
    if (calidadConexion() === "sin-red") {
      // Sin señal no hay nada que bajar: se trabaja con lo que ya hay.
      entrarAModoLocal();
      return;
    }
    cancelado.current = false;
    setDescarga({ etapa: "en-curso", progreso: { fase: "subiendo", hechas: 0, total: 1 } });
    const reporte = await descargarParaModoLocal(ownerId, router, {
      onProgreso: (progreso) => setDescarga({ etapa: "en-curso", progreso }),
      cancelado: () => cancelado.current,
    });
    if (descargaCompleta(reporte)) {
      entrarAModoLocal();
      setDescarga(null);
    } else {
      // No se entra en silencio: se muestra qué faltó y el cobrador decide.
      setDescarga({ etapa: "revisar", reporte });
      setAbierto(true);
    }
  }

  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    setResultado(null);
    try {
      setResultado(await sincronizarAhora(ownerId));
      router.refresh();
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Sincronización: ${resumen.etiqueta}. Toca para ver detalles.`}
        className={cn(
          "relative flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
          CLASE_TONO[resumen.tono]
        )}
      >
        <IconoEstado icono={resumen.icono} girando={sincronizando} />
        <span className="whitespace-nowrap">{resumen.etiqueta}</span>
        {resumen.sugerencia && (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-pagado ring-2 ring-background" />
        )}
      </button>
      <PanelSync
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        estado={estado}
        descarga={descarga}
        sincronizando={sincronizando}
        resultado={resultado}
        acciones={{
          apagar: () => void prepararYApagar(),
          cancelarDescarga: () => {
            cancelado.current = true;
          },
          entrarIgual: () => {
            entrarAModoLocal();
            setDescarga(null);
          },
          descartarDescarga: () => setDescarga(null),
          reintentarDescarga: () => void prepararYApagar(),
          sincronizar: () => void sincronizar(),
        }}
        ownerId={ownerId}
      />
    </>
  );
}

function porcentaje(p: ProgresoDescarga): number {
  // Pesos aproximados de cada fase en el tiempo total.
  const inicio = { subiendo: 0, datos: 10, deudores: 40, pantallas: 60 }[p.fase];
  const peso = { subiendo: 10, datos: 30, deudores: 20, pantallas: 40 }[p.fase];
  const avance = p.total > 0 ? p.hechas / p.total : 0;
  return Math.min(99, Math.round(inicio + peso * avance));
}

const CLASE_TONO: Record<Tono, string> = {
  ok: "bg-pagado/10 text-pagado",
  neutro: "bg-muted text-muted-foreground",
  aviso: "bg-pendiente/15 text-pendiente",
  error: "bg-destructive/10 text-destructive",
};

export function IconoEstado({ icono, girando }: { icono: Icono; girando?: boolean }) {
  const cls = "size-3";
  if (girando || icono === "enviando") return <Loader2 className={cn(cls, "animate-spin")} />;
  switch (icono) {
    case "descargando":
      return <Download className={cn(cls, "animate-pulse")} />;
    case "revisar":
      return <AlertTriangle className={cls} />;
    case "local":
      return <Smartphone className={cls} />;
    case "sin-senal":
      return <CloudOff className={cls} />;
    case "debil":
      return <SignalLow className={cls} />;
    case "espera":
      return <Clock className={cls} />;
    case "ok":
      return <CheckCircle2 className={cls} />;
    default:
      return <Signal className={cls} />;
  }
}
