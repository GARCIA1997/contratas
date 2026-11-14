"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { avisar, confirmar as pedirConfirmacion } from "@/lib/dialogo";
import {
  AJUSTES_POR_DEFECTO,
  AVISOS_POR_CUOTA_RIESGOSO,
  CUPO_MAXIMO,
  DIAS_ANTES_POSIBLES,
  avisosPorCuota,
  type AjustesEnvio,
} from "@/lib/whatsapp-auto/ajustes-envio";

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
        if (confirmar && !(await pedirConfirmacion(confirmar))) return;
        setOcupado(true);
        try {
          await enviar(cuerpo);
          router.refresh();
        } catch (e) {
          void avisar(e instanceof Error ? e.message : "Error");
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

/**
 * Barra de la tabla de números: buscador (usuario, correo o número), y el
 * botón "Ligar número" que abre el formulario para asignar un WhatsApp a un
 * usuario dueño de su espacio que todavía no tiene uno.
 */
export function BarraCuentas({
  usuarios,
  q,
  lleno,
  maximo,
}: {
  usuarios: { id: string; etiqueta: string }[];
  q: string;
  lleno: boolean;
  maximo: number;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (texto === q) return;
      const p = new URLSearchParams(window.location.search);
      if (texto.trim()) p.set("q", texto.trim());
      else p.delete("q");
      router.replace(`/monitor/whatsapp?${p.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [texto, q, router]);

  const motivo = lleno
    ? `Ya hay ${maximo} números (máximo)`
    : usuarios.length === 0
      ? "Todos los usuarios ya tienen número"
      : null;

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center gap-space-sm">
        <label className="flex min-w-[260px] flex-1 items-center gap-space-xs rounded-lg bg-surface-container px-2 py-1.5">
          <span className="material-symbols-outlined text-[16px] text-outline">search</span>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por usuario, correo o número de WhatsApp"
            aria-label="Buscar número o usuario"
            className="w-full bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline"
          />
        </label>
        <button
          type="button"
          disabled={Boolean(motivo)}
          title={motivo ?? undefined}
          className={cn(BOTON, TONOS.primario, "py-1.5")}
          onClick={() => setAbierto((v) => !v)}
        >
          <span className="material-symbols-outlined text-[15px]">add_link</span>
          Ligar número
        </button>
        {motivo && <span className="font-label-sm text-label-sm text-outline">{motivo}</span>}
      </div>
      {abierto && !motivo && <FormLigarNumero usuarios={usuarios} alTerminar={() => setAbierto(false)} />}
    </div>
  );
}

function FormLigarNumero({
  usuarios,
  alTerminar,
}: {
  usuarios: { id: string; etiqueta: string }[];
  alTerminar: () => void;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const visibles = usuarios.filter((u) => u.etiqueta.toLowerCase().includes(filtro.trim().toLowerCase()));

  return (
    <form
      className="flex flex-col gap-space-sm rounded-lg bg-surface-container p-space-md"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setGuardando(true);
        try {
          await enviar({ accion: "crear_cuenta", ownerId, numero });
          alTerminar();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Error");
        } finally {
          setGuardando(false);
        }
      }}
    >
      <span className="font-headline-sm text-headline-sm text-on-surface">Ligar número de WhatsApp a un usuario</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        Solo usuarios dueños de su espacio sin número asignado. El número no tiene que ser el de su cuenta; después
        se vincula con código o QR desde su detalle.
      </span>
      <div className="grid gap-space-sm md:grid-cols-2">
        <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
          Usuario
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por nombre o correo"
            className="rounded-lg bg-surface-container-high px-2 py-1.5 text-on-surface"
          />
          <select
            required
            size={Math.min(6, Math.max(2, visibles.length))}
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            aria-label="Usuario"
            className="rounded-lg bg-surface-container-high px-2 py-1 text-on-surface"
          >
            {visibles.map((u) => (
              <option key={u.id} value={u.id}>
                {u.etiqueta}
              </option>
            ))}
          </select>
          {visibles.length === 0 && <span className="text-outline">Sin coincidencias</span>}
        </label>
        <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
          Número de WhatsApp
          <input
            required
            inputMode="tel"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="312 112 8425"
            className="rounded-lg bg-surface-container-high px-2 py-1.5 text-on-surface"
          />
          <span className="text-outline">10 dígitos (se le agrega +52) o con lada de país.</span>
        </label>
      </div>
      <div className="flex items-center gap-space-xs">
        <button type="submit" disabled={!ownerId || !numero || guardando} className={cn(BOTON, TONOS.primario, "py-1.5")}>
          {guardando ? "Guardando…" : "Ligar número"}
        </button>
        <button type="button" className={cn(BOTON, TONOS.normal, "py-1.5")} onClick={alTerminar}>
          Cancelar
        </button>
        {error && <span className="font-label-sm text-label-sm text-error">{error}</span>}
      </div>
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
        if (!(await pedirConfirmacion("Se desvincula el número actual, se cancela lo pendiente y el nuevo empieza de cero (calentamiento y presentación). ¿Continuar?"))) return;
        try {
          await enviar({ accion: "cambiar_numero", cuentaId, numero });
          setAbierto(false);
          router.refresh();
        } catch (err) {
          void avisar(err instanceof Error ? err.message : "Error");
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
        {lista.total} destinatario{lista.total === 1 ? "" : "s"} (clientes con contrata activa y deudores con saldo, con teléfono y sin presentación previa).
        Rampa: 20/día los primeros 3 días, luego 30/día, dentro del cupo de 200 y de 9:00 a 22:00.
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
              void avisar(e instanceof Error ? e.message : "Error");
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

/** Manda un mensaje de prueba por la cola normal a cualquier teléfono. */
export function FormPrueba({ cuentaId, aviso }: { cuentaId: string; aviso: string | null }) {
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <form
      className="flex flex-col gap-space-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!(await pedirConfirmacion(`Se enviará un mensaje real de WhatsApp a ${telefono}. ¿Continuar?`))) return;
        setEnviando(true);
        setEstado(null);
        try {
          await enviar({ accion: "prueba", cuentaId, telefono, texto: texto.trim() || null });
          setEstado({ tipo: "ok", texto: "En cola: el estado aparece abajo en unos segundos." });
          setTexto("");
          router.refresh();
        } catch (err) {
          setEstado({ tipo: "error", texto: err instanceof Error ? err.message : "Error" });
        } finally {
          setEnviando(false);
        }
      }}
    >
      <div className="grid gap-space-sm md:grid-cols-[220px_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
          Teléfono destino
          <input
            required
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="312 112 8425"
            className="rounded-lg bg-surface-container px-2 py-1.5 text-on-surface"
          />
        </label>
        <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
          Texto (opcional)
          <input
            value={texto}
            maxLength={1000}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Si lo dejas vacío se manda un texto de prueba estándar"
            className="rounded-lg bg-surface-container px-2 py-1.5 text-on-surface"
          />
        </label>
        <button type="submit" disabled={enviando || !telefono} className={cn(BOTON, TONOS.primario, "py-1.5")}>
          <span className="material-symbols-outlined text-[15px]">send</span>
          {enviando ? "Enviando…" : "Enviar prueba"}
        </button>
      </div>
      {aviso && <span className="font-label-sm text-label-sm text-tertiary">{aviso}</span>}
      {estado && (
        <span className={cn("font-label-sm text-label-sm", estado.tipo === "ok" ? "text-secondary" : "text-error")}>{estado.texto}</span>
      )}
    </form>
  );
}

/**
 * Manda un push de prueba a tus dispositivos: confirma que te llegarán los
 * avisos de incidentes (worker caído, sesión cerrada, mensajes rechazados).
 */
export function ProbarAviso() {
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      disabled={ocupado}
      className={cn(BOTON, TONOS.normal)}
      onClick={async () => {
        setOcupado(true);
        try {
          const res = await fetch("/api/monitor/push-prueba", { method: "POST" });
          const j = (await res.json().catch(() => ({}))) as {
            enviadas?: number;
            dispositivos?: number;
            antiguas?: number;
            deshabilitado?: boolean;
            error?: string;
          };
          if (!res.ok) throw new Error(j.error ?? "No se pudo enviar");
          if (j.deshabilitado) {
            await avisar("Los avisos push no están configurados en el servidor (faltan las llaves VAPID).");
          } else if (!j.dispositivos) {
            await avisar(
              j.antiguas
                ? `Hay ${j.antiguas} dispositivo(s) con notificaciones activadas antes de la versión que avisa por persona: a esos NO les llegan los avisos del monitor. En tu celular desactiva y vuelve a activar las notificaciones de la app, y prueba otra vez.`
                : "No tienes ningún dispositivo suscrito a los avisos. Abre la app en tu celular, entra con tu usuario y activa las notificaciones; luego vuelve a probar."
            );
          } else if (!j.enviadas) {
            await avisar(
              `No se pudo entregar a tus ${j.dispositivos} dispositivo(s): la suscripción caducó. Vuelve a activar las notificaciones en la app del celular.`
            );
          } else {
            await avisar(
              `Aviso enviado a ${j.enviadas} de ${j.dispositivos} dispositivo(s). Si no aparece en tu celular en unos segundos, revisa los permisos de notificaciones de la app.`
            );
          }
        } catch (e) {
          await avisar(e instanceof Error ? e.message : "No se pudo enviar");
        } finally {
          setOcupado(false);
        }
      }}
    >
      <span className="material-symbols-outlined text-[16px]">notifications_active</span>
      {ocupado ? "Enviando…" : "Probar aviso"}
    </button>
  );
}

const SELECT =
  "rounded-lg bg-surface-container-lowest px-2 py-1 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";

/** Opciones de un select de números ("1 día", "2 días"…). */
function opciones(desde: number, hasta: number, etiqueta: (n: number) => string) {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).map((n) => (
    <option key={n} value={n}>
      {etiqueta(n)}
    </option>
  ));
}

const dias = (n: number) => `${n} día${n === 1 ? "" : "s"}`;

/**
 * Ajustes de envío de la cuenta (cuándo y cuánto). El usuario sigue
 * encendiendo y apagando cada tipo desde su Configuración.
 */
export function FormAjustesEnvio({ cuentaId, inicial }: { cuentaId: string; inicial: AjustesEnvio }) {
  const router = useRouter();
  const [a, setA] = useState<AjustesEnvio>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const cambiar = <K extends keyof AjustesEnvio>(k: K, v: AjustesEnvio[K]) => {
    setEstado(null);
    setA((x) => ({ ...x, [k]: v }));
  };
  const avisos = avisosPorCuota(a);
  const sinCambios = JSON.stringify(a) === JSON.stringify(inicial);

  return (
    <form
      className="flex flex-col gap-space-md"
      onSubmit={async (e) => {
        e.preventDefault();
        if (avisos > AVISOS_POR_CUOTA_RIESGOSO &&
          !(await pedirConfirmacion(`Con estos ajustes un cliente puede recibir hasta ${avisos} avisos por cuota. Muchos avisos aumentan el riesgo de que WhatsApp restrinja el número. ¿Guardar de todos modos?`)))
          return;
        setGuardando(true);
        try {
          await enviar({ accion: "ajustes_envio", cuentaId, ajustes: a });
          setEstado({ tipo: "ok", texto: "Guardado. Aplica desde la siguiente programación (cada hora)." });
          router.refresh();
        } catch (err) {
          setEstado({ tipo: "error", texto: err instanceof Error ? err.message : "No se pudo guardar" });
        } finally {
          setGuardando(false);
        }
      }}
    >
      <div className="grid gap-space-md md:grid-cols-2">
        <fieldset className="flex flex-col gap-space-xs">
          <legend className="mb-1 font-label-sm text-label-sm text-on-surface-variant">Aviso antes del pago (por vencer)</legend>
          <div className="flex flex-wrap gap-space-sm">
            {DIAS_ANTES_POSIBLES.map((d) => (
              <label key={d} className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={a.avisoDiasAntes.includes(d)}
                  onChange={(e) =>
                    cambiar(
                      "avisoDiasAntes",
                      (e.target.checked ? [...a.avisoDiasAntes, d] : a.avisoDiasAntes.filter((x) => x !== d)).sort((x, y) => y - x)
                    )
                  }
                />
                {d === 0 ? "El mismo día" : `${dias(d)} antes`}
              </label>
            ))}
          </div>
          <span className="font-body-sm text-body-sm text-outline">Cada día marcado manda su propio aviso.</span>
        </fieldset>

        <fieldset className="flex flex-col gap-space-xs">
          <legend className="mb-1 font-label-sm text-label-sm text-on-surface-variant">Aviso de vencida</legend>
          <div className="flex flex-wrap items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
            Primero a los
            <select className={SELECT} value={a.vencidaDiasDespues} onChange={(e) => cambiar("vencidaDiasDespues", Number(e.target.value))}>
              {opciones(1, 3, dias)}
            </select>
            de atraso.
          </div>
          <div className="flex flex-wrap items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
            Repetir
            <select className={SELECT} value={a.vencidaRepetirCada} onChange={(e) => cambiar("vencidaRepetirCada", Number(e.target.value))}>
              <option value={0}>no</option>
              {opciones(1, 7, (n) => `cada ${dias(n)}`)}
            </select>
            {a.vencidaRepetirCada > 0 && (
              <select className={SELECT} value={a.vencidaRepeticiones} onChange={(e) => cambiar("vencidaRepeticiones", Number(e.target.value))}>
                {opciones(1, 5, (n) => `${n} vez${n === 1 ? "" : "es"} más`)}
              </select>
            )}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-space-xs">
          <legend className="mb-1 font-label-sm text-label-sm text-on-surface-variant">Horario de recordatorios</legend>
          <div className="flex flex-wrap items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
            De
            <select className={SELECT} value={a.horaInicio} onChange={(e) => cambiar("horaInicio", Number(e.target.value))}>
              {opciones(6, 20, (n) => `${n}:00`)}
            </select>
            a
            <select className={SELECT} value={a.horaFin} onChange={(e) => cambiar("horaFin", Number(e.target.value))}>
              {opciones(8, 23, (n) => `${n}:00`)}
            </select>
          </div>
          <span className="font-body-sm text-body-sm text-outline">Los recibos salen a cualquier hora.</span>
        </fieldset>

        <fieldset className="flex flex-col gap-space-xs">
          <legend className="mb-1 font-label-sm text-label-sm text-on-surface-variant">Deudores y tope diario</legend>
          <div className="flex flex-wrap items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
            Recordatorio a deudores cada
            <select className={SELECT} value={a.diasEntreDeudor} onChange={(e) => cambiar("diasEntreDeudor", Number(e.target.value))}>
              {[7, 10, 15, 20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {dias(n)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
            Máximo
            <input
              type="number"
              min={20}
              max={CUPO_MAXIMO}
              className={cn(SELECT, "w-20")}
              value={a.cupoDiario}
              onChange={(e) => cambiar("cupoDiario", Number(e.target.value))}
            />
            mensajes al día (hasta {CUPO_MAXIMO})
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-space-sm">
        <button type="submit" disabled={guardando || sinCambios || a.avisoDiasAntes.length === 0} className={cn(BOTON, TONOS.primario)}>
          <span className="material-symbols-outlined text-[15px]">save</span>
          {guardando ? "Guardando…" : "Guardar ajustes"}
        </button>
        {!sinCambios && (
          <button type="button" className={cn(BOTON, TONOS.normal)} onClick={() => setA(inicial)}>
            Descartar cambios
          </button>
        )}
        <button
          type="button"
          className={cn(BOTON, TONOS.normal)}
          disabled={JSON.stringify(a) === JSON.stringify(AJUSTES_POR_DEFECTO)}
          onClick={() => setA(AJUSTES_POR_DEFECTO)}
        >
          Valores por defecto
        </button>
        <span className={cn("font-body-sm text-body-sm", avisos > AVISOS_POR_CUOTA_RIESGOSO ? "text-tertiary" : "text-on-surface-variant")}>
          Hasta {avisos} aviso{avisos === 1 ? "" : "s"} por cuota sin pagar
          {avisos > AVISOS_POR_CUOTA_RIESGOSO && " — riesgo alto de que WhatsApp restrinja el número"}
        </span>
        {a.avisoDiasAntes.length === 0 && <span className="font-body-sm text-body-sm text-error">Elige al menos un día antes del pago.</span>}
        {estado && <span className={cn("font-body-sm text-body-sm", estado.tipo === "ok" ? "text-secondary" : "text-error")}>{estado.texto}</span>}
      </div>
    </form>
  );
}
