"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

async function enviar(cuerpo: object) {
  const res = await fetch("/api/monitor/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "No se pudo completar");
  }
}

const BOTON =
  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-label-sm text-label-sm transition-colors disabled:opacity-50";
const TONOS = {
  normal: "bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  primario: "bg-primary-container text-on-primary-container hover:opacity-90",
  peligro: "bg-error-container/40 text-error hover:bg-error-container/60",
};

/** Botón que manda una acción al monitor, con confirmación opcional. */
export function BotonAccion({
  cuerpo,
  texto,
  icono,
  confirmar,
  tono = "normal",
}: {
  cuerpo: object;
  texto: string;
  icono?: string;
  confirmar?: string;
  tono?: keyof typeof TONOS;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      disabled={ocupado}
      className={cn(BOTON, TONOS[tono])}
      onClick={async () => {
        if (confirmar && !confirm(confirmar)) return;
        setOcupado(true);
        try {
          await enviar(cuerpo);
          router.refresh();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Error");
        } finally {
          setOcupado(false);
        }
      }}
    >
      {icono && <span className="material-symbols-outlined text-[15px]">{icono}</span>}
      {ocupado ? "…" : texto}
    </button>
  );
}

/** Alta de número: elegir usuario (dueño de espacio) + capturar número. */
export function FormNuevaCuenta({ usuarios }: { usuarios: { id: string; etiqueta: string }[] }) {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState("");
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (usuarios.length === 0) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-space-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await enviar({ accion: "crear_cuenta", ownerId, numero });
          setNumero("");
          setOwnerId("");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Error");
        }
      }}
    >
      <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
        Usuario
        <select
          required
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="rounded-lg bg-surface-container px-2 py-1.5 text-on-surface"
        >
          <option value="">Elegir…</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
        Número de WhatsApp (no tiene que ser el de su cuenta)
        <input
          required
          inputMode="tel"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="312 112 8425"
          className="rounded-lg bg-surface-container px-2 py-1.5 text-on-surface"
        />
      </label>
      <button type="submit" className={cn(BOTON, TONOS.primario, "py-1.5")}>
        Asignar número
      </button>
      {error && <span className="font-label-sm text-label-sm text-error">{error}</span>}
    </form>
  );
}

export function FormCambiarNumero({ cuentaId }: { cuentaId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState("");
  if (!abierto) {
    return (
      <button type="button" className={cn(BOTON, TONOS.normal)} onClick={() => setAbierto(true)}>
        <span className="material-symbols-outlined text-[15px]">swap_horiz</span>Cambiar número
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-space-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm("Se desvincula el número actual, se cancela lo pendiente y el nuevo empieza de cero (calentamiento y presentación). ¿Continuar?")) return;
        try {
          await enviar({ accion: "cambiar_numero", cuentaId, numero });
          setAbierto(false);
          router.refresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : "Error");
        }
      }}
    >
      <input
        required
        autoFocus
        inputMode="tel"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        placeholder="Número nuevo"
        className="rounded-lg bg-surface-container px-2 py-1 text-on-surface"
      />
      <button type="submit" className={cn(BOTON, TONOS.primario)}>
        Guardar
      </button>
      <button type="button" className={cn(BOTON, TONOS.normal)} onClick={() => setAbierto(false)}>
        Cancelar
      </button>
    </form>
  );
}

/** Revisa la lista de destinatarios y pide confirmación explícita antes de iniciar. */
export function IniciarCampana({ cuentaId }: { cuentaId: string }) {
  const router = useRouter();
  const [lista, setLista] = useState<{ total: number; muestra: { nombre: string; telefono: string }[] } | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [cargando, setCargando] = useState(false);

  if (!lista) {
    return (
      <button
        type="button"
        disabled={cargando}
        className={cn(BOTON, TONOS.primario)}
        onClick={async () => {
          setCargando(true);
          const r = await fetch(`/api/monitor/whatsapp?cuenta=${cuentaId}&presentacion=1`);
          setLista(r.ok ? await r.json() : null);
          setCargando(false);
        }}
      >
        <span className="material-symbols-outlined text-[15px]">campaign</span>
        {cargando ? "Calculando…" : "Preparar campaña de presentación"}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-space-sm rounded-lg bg-surface-container p-space-md">
      <span className="font-body-md text-body-md text-on-surface">
        {lista.total} destinatario{lista.total === 1 ? "" : "s"} (clientes con contrata activa y deudores con saldo, con teléfono, sin baja ni presentación previa).
        Rampa: 20/día los primeros 3 días, luego 30/día, dentro del cupo de 100 y de 9:00 a 19:00.
      </span>
      <div className="max-h-56 overflow-auto rounded bg-surface-container-lowest p-space-sm font-code-sm text-code-sm text-on-surface-variant">
        {lista.muestra.map((d) => (
          <div key={d.telefono}>
            {d.telefono} · {d.nombre}
          </div>
        ))}
        {lista.total > lista.muestra.length && <div>… y {lista.total - lista.muestra.length} más</div>}
      </div>
      <label className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        Revisé la lista y entiendo que es el envío de mayor riesgo para el número.
      </label>
      <div className="flex gap-space-xs">
        <button
          type="button"
          disabled={!acepto || lista.total === 0}
          className={cn(BOTON, TONOS.primario)}
          onClick={async () => {
            try {
              await enviar({ accion: "iniciar_campana", cuentaId, total: lista.total });
              setLista(null);
              router.refresh();
            } catch (e) {
              alert(e instanceof Error ? e.message : "Error");
            }
          }}
        >
          Iniciar campaña
        </button>
        <button type="button" className={cn(BOTON, TONOS.normal)} onClick={() => setLista(null)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Mientras se espera el QR o el código, el panel se refresca seguido (el QR caduca en ~60 s). */
export function RefrescoRapido({ activo }: { activo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => router.refresh(), 4_000);
    return () => clearInterval(t);
  }, [activo, router]);
  return null;
}
