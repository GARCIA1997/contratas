"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/offline/db";
import { descartarOperacion, reintentarConflictos } from "@/lib/offline/queue";
import { describirOperacion, type OperacionDescrita } from "@/lib/offline/describir-operacion";
import { haceCuanto } from "@/lib/offline/resumen-sync";
import { LIMITE_OPERACIONES_LOCALES, AVISO_OPERACIONES_LOCALES } from "@/lib/offline/modo-local";
import type { EstadoSync } from "@/lib/offline/use-estado-sync";
import type { ResultadoSincronizacion, FaseDescarga } from "@/lib/offline/modo-local-flujo";
import type { Descarga } from "@/components/offline/control-sync";
import { cn } from "@/lib/utils";

type Acciones = {
  apagar: () => void;
  cancelarDescarga: () => void;
  entrarIgual: () => void;
  descartarDescarga: () => void;
  reintentarDescarga: () => void;
  sincronizar: () => void;
};

/**
 * Panel de sincronización (hoja inferior). Una sección por pregunta que se
 * hace el cobrador: ¿estoy sincronizando?, ¿qué tengo pendiente?, ¿hay algo
 * que revisar?, ¿qué tan frescos son mis datos?
 */
export function PanelSync(props: {
  abierto: boolean;
  onCerrar: () => void;
  ownerId: string;
  estado: EstadoSync;
  descarga: Descarga | null;
  sincronizando: boolean;
  resultado: ResultadoSincronizacion | null;
  acciones: Acciones;
}) {
  const { abierto, onCerrar, ownerId, estado, descarga, sincronizando, resultado, acciones } = props;

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onCerrar}>
      <div
        role="dialog"
        aria-label="Sincronización"
        className="max-h-[88dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl border border-border/60 bg-card p-5 shadow-2xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Sincronización</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1 hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>

        {descarga ? (
          <SeccionDescarga descarga={descarga} acciones={acciones} />
        ) : (
          <SeccionSwitch estado={estado} sincronizando={sincronizando} acciones={acciones} />
        )}

        {resultado && <SeccionResultado resultado={resultado} />}
        <SeccionEstado estado={estado} />
        <SeccionCola ownerId={ownerId} estado={estado} />

        {!estado.modoLocal && !descarga && (
          <Button
            className="w-full"
            variant="outline"
            disabled={sincronizando || estado.calidad === "sin-red"}
            onClick={acciones.sincronizar}
          >
            {sincronizando ? <Loader2 className="size-4 animate-spin" /> : null}
            {estado.calidad === "sin-red" ? "Sin señal para sincronizar" : "Sincronizar ahora"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Switch ──────────────────────────────────────────────────────────── */

function SeccionSwitch({
  estado,
  sincronizando,
  acciones,
}: {
  estado: EstadoSync;
  sincronizando: boolean;
  acciones: Acciones;
}) {
  const encendida = !estado.modoLocal;
  return (
    <div className="space-y-2 rounded-2xl bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Sincronización automática</p>
          <p className="text-xs text-muted-foreground">
            {encendida
              ? "Encendida: lo que registras se sube solo cuando hay señal."
              : "Apagada (modo local): todo se guarda en el teléfono."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={encendida}
          aria-label="Sincronización automática"
          disabled={sincronizando}
          onClick={encendida ? acciones.apagar : acciones.sincronizar}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
            encendida ? "bg-pagado" : "bg-muted-foreground/40"
          )}
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full bg-white shadow transition-transform",
              encendida ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          >
            {sincronizando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {encendida
          ? "¿Vas a una zona sin señal? Apágala antes de salir: primero se sube lo pendiente y se descarga todo."
          : estado.calidad === "rapida" && estado.pendientes > 0
            ? "Ya tienes buena señal: enciéndela para subir lo que registraste."
            : "Enciéndela cuando tengas señal para subir lo que registraste."}
      </p>
    </div>
  );
}

/* ── Descarga previa al modo local ───────────────────────────────────── */

const FASE: Record<FaseDescarga, string> = {
  subiendo: "Subiendo lo pendiente…",
  datos: "Descargando clientes, contratas y citas…",
  deudores: "Descargando abonos de deudores…",
  pantallas: "Guardando pantallas para abrirlas sin señal…",
};

function SeccionDescarga({ descarga, acciones }: { descarga: Descarga; acciones: Acciones }) {
  if (descarga.etapa === "en-curso") {
    const { fase, hechas, total } = descarga.progreso;
    return (
      <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
        <p className="font-semibold">Preparando el teléfono para trabajar sin señal</p>
        <p className="text-sm text-muted-foreground">{FASE[fase]}</p>
        <Barra valor={total > 0 ? hechas / total : 0} />
        <Button variant="outline" className="w-full" onClick={acciones.cancelarDescarga}>
          Detener
        </Button>
      </div>
    );
  }

  const r = descarga.reporte;
  return (
    <div className="space-y-3 rounded-2xl border border-pendiente/40 bg-pendiente/5 p-4">
      <p className="font-semibold">El teléfono no quedó listo del todo</p>
      <ul className="space-y-1 text-sm">
        <Paso ok={r.pendientesSinSubir === 0} texto={r.pendientesSinSubir === 0 ? "Todo lo pendiente subió" : `${r.pendientesSinSubir} movimientos sin subir`} />
        <Paso ok={r.datos} texto="Clientes, contratas y citas" />
        <Paso ok={r.deudores.hechos === r.deudores.total} texto={`Abonos de deudores (${r.deudores.hechos}/${r.deudores.total})`} />
        <Paso ok={r.pantallas.hechas === r.pantallas.total} texto={`Pantallas guardadas (${r.pantallas.hechas}/${r.pantallas.total})`} />
      </ul>
      <p className="text-xs text-muted-foreground">
        Si entras así, lo que falta puede no abrir o verse desactualizado sin señal.
      </p>
      <div className="grid gap-2">
        <Button onClick={acciones.reintentarDescarga}>Reintentar</Button>
        <Button variant="outline" onClick={acciones.entrarIgual}>Entrar a modo local así</Button>
        <Button variant="ghost" onClick={acciones.descartarDescarga}>Seguir sincronizando</Button>
      </div>
    </div>
  );
}

function Paso({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <Check className="size-4 text-pagado" /> : <X className="size-4 text-destructive" />}
      <span className={ok ? "" : "font-medium"}>{texto}</span>
    </li>
  );
}

/* ── Resultado de la última sincronización manual ────────────────────── */

function SeccionResultado({ resultado }: { resultado: ResultadoSincronizacion }) {
  if (!resultado.intentado) {
    return <Aviso tono="aviso">Sin señal: se subirá en cuanto haya conexión.</Aviso>;
  }
  const { subidas, porRevisar, sinSubir, datos } = resultado;
  const partes: string[] = [];
  if (subidas > 0) partes.push(`${subidas} movimiento${subidas === 1 ? "" : "s"} subido${subidas === 1 ? "" : "s"}`);
  if (porRevisar > 0) partes.push(`${porRevisar} por revisar`);
  if (sinSubir > 0) partes.push(`${sinSubir} sin subir: la señal se cortó, se reintentará sola`);
  if (datos === false) partes.push("no se pudieron bajar todos los datos");
  const hayProblema = porRevisar > 0 || sinSubir > 0 || datos === false;
  return (
    <Aviso tono={hayProblema ? "aviso" : "ok"}>
      {partes.length > 0 ? partes.join(" · ") : "Todo al día."}
    </Aviso>
  );
}

/* ── Conexión, datos y cola ──────────────────────────────────────────── */

const CALIDAD: Record<EstadoSync["calidad"], string> = {
  rapida: "Buena",
  lenta: "Débil (se guarda en el teléfono si no alcanza)",
  "sin-red": "Sin señal",
};

function SeccionEstado({ estado }: { estado: EstadoSync }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const enCola = estado.pendientes + estado.conflictos;
  const reintento = estado.envio.proximoReintento;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Señal</dt>
      <dd>{estado.modoLocal ? "No se usa (modo local)" : CALIDAD[estado.calidad]}</dd>
      <dt className="text-muted-foreground">Datos</dt>
      <dd>Actualizados {haceCuanto(estado.ultimoSync, ahora)}</dd>
      <dt className="text-muted-foreground">En el teléfono</dt>
      <dd className="space-y-1">
        <span className={cn(enCola >= AVISO_OPERACIONES_LOCALES && "font-semibold text-destructive")}>
          {enCola} de {LIMITE_OPERACIONES_LOCALES} movimientos sin subir
        </span>
        <Barra valor={enCola / LIMITE_OPERACIONES_LOCALES} alerta={enCola >= AVISO_OPERACIONES_LOCALES} />
      </dd>
      {reintento && !estado.modoLocal && (
        <>
          <dt className="text-muted-foreground">Reintento</dt>
          <dd>En {Math.max(0, Math.ceil((reintento - ahora) / 1000))} s</dd>
        </>
      )}
    </dl>
  );
}

function SeccionCola({ ownerId, estado }: { ownerId: string; estado: EstadoSync }) {
  const [porDescartar, setPorDescartar] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const ops =
    useLiveQuery(async () => {
      if (!db) return [];
      const items = await db.writeQueue.where("ownerId").equals(ownerId).sortBy("createdAt");
      return Promise.all(items.map(describirOperacion));
    }, [ownerId]) ?? [];

  if (ops.length === 0) return null;
  const conflictos = ops.filter((o) => o.estado === "conflict");
  const pendientes = ops.filter((o) => o.estado !== "conflict");
  const puedeReintentar = !estado.modoLocal && estado.calidad !== "sin-red";

  async function reintentar() {
    setReintentando(true);
    try {
      await reintentarConflictos(ownerId);
    } finally {
      setReintentando(false);
    }
  }

  return (
    <div className="space-y-4">
      {conflictos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-destructive">Por revisar</p>
          <p className="text-xs text-muted-foreground">
            El servidor no las aceptó. Ya no se muestran como hechas en el teléfono. Reinténtalas
            si ya se corrigió la causa, o descártalas.
          </p>
          <ul className="space-y-2">
            {conflictos.map((o) => (
              <li key={o.id} className="rounded-xl border border-destructive/30 p-3 text-sm">
                <FilaOperacion op={o} />
                {o.motivo && <p className="mt-1 text-xs text-destructive">{o.motivo}</p>}
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-destructive underline"
                  onClick={() =>
                    porDescartar === o.id
                      ? void descartarOperacion(ownerId, o.id).then(() => setPorDescartar(null))
                      : setPorDescartar(o.id)
                  }
                >
                  {porDescartar === o.id ? "¿Seguro? Toca otra vez para descartar" : "Descartar"}
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            className="w-full"
            disabled={!puedeReintentar || reintentando}
            onClick={() => void reintentar()}
          >
            {reintentando && <Loader2 className="size-4 animate-spin" />}
            {puedeReintentar ? "Reintentar todo" : estado.modoLocal ? "Enciende la sincronización para reintentar" : "Sin señal para reintentar"}
          </Button>
        </div>
      )}

      {pendientes.length > 0 && (
        <details className="space-y-2" open={pendientes.length <= 5}>
          <summary className="cursor-pointer text-sm font-semibold">
            Pendientes de subir ({pendientes.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {pendientes.map((o) => (
              <li key={o.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <FilaOperacion op={o} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FilaOperacion({ op }: { op: OperacionDescrita }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span>
        {op.titulo}
        {op.detalle && <span className="text-muted-foreground"> · {op.detalle}</span>}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {new Date(op.creadaEn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ── Piezas ──────────────────────────────────────────────────────────── */

function Barra({ valor, alerta }: { valor: number; alerta?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", alerta ? "bg-destructive" : "bg-pagado")}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, valor)) * 100)}%` }}
      />
    </div>
  );
}

function Aviso({ tono, children }: { tono: "ok" | "aviso"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        tono === "ok" ? "bg-pagado/10 text-pagado" : "bg-pendiente/10 text-pendiente"
      )}
    >
      {children}
    </p>
  );
}
