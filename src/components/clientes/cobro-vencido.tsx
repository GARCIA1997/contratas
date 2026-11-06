"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CircleDollarSign, MessageCircle } from "lucide-react";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatMoneda } from "@/lib/utils";
import type { ResultadoCobroVencidas } from "@/lib/services/cobros";
import { guardarOperacion } from "@/lib/offline/guardar";
import { syncContratas } from "@/lib/offline/sync";
import { linkWhatsApp } from "@/lib/whatsapp";
import { useReciboAutomatico } from "@/lib/whatsapp-auto/use-recibo-automatico";
import { SeguimientoRecibo } from "@/components/whatsapp/seguimiento-recibo";
import { mensajeCobro } from "@/lib/mensajes-whatsapp";
import { mensajeDeError } from "@/lib/offline/conexion";
import { getCobroVencidoDetalle, itemsCobroVencido } from "@/lib/offline/repo";
import { Popup } from "@/components/ui/popup";
import { ElegirPersonas } from "@/components/beneficiarios/elegir-personas";
import { agruparPorPersona, hayBeneficiarios, type Persona } from "@/lib/cobro-por-persona";
import { useFuncion } from "@/lib/offline/use-funcion";
import type { CuotaVencidaItem } from "@/lib/services/cobros";
import { confirmar } from "@/lib/dialogo";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

function construirMensaje(nombreApp: string, r: ResultadoCobroVencidas) {
  return mensajeCobro({
    nombreApp,
    clienteNombre: r.clienteNombre,
    total: r.total,
    contratas: r.contratas,
  });
}

export function CobroVencido({
  clienteId,
  nombreApp,
  totalInicial,
  cuotasInicial,
  ownerId,
  enFila = false,
  clienteNombre,
}: {
  /** Para nombrar al titular al elegir personas (función "beneficiarios"). */
  clienteNombre?: string;
  clienteId: string;
  nombreApp: string;
  totalInicial: number;
  cuotasInicial: number;
  /** Presente cuando la página vive en la capa offline (ver repo/useLiveQuery). */
  ownerId?: string | null;
  /**
   * El botón comparte renglón con otro (hoy "Abonar", en el perfil del
   * cliente), dentro de un grid de 2 columnas. Compacta la etiqueta a dos
   * renglones y hace que el recibo que aparece DESPUÉS de cobrar ocupe la
   * fila completa — a media columna queda ilegible en un celular.
   */
  enFila?: boolean;
}) {
  const router = useRouter();
  const reciboAutomatico = useReciboAutomatico(ownerId);
  const [total, setTotal] = useState(totalInicial);
  const [cuotas, setCuotas] = useState(cuotasInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCobroVencidas | null>(
    null
  );
  const [sinRecibo, setSinRecibo] = useState(false);
  /** El cobro se aplicó local y todavía no viajó al servidor. */
  const [offlinePendiente, setOfflinePendiente] = useState(false);
  // Se fija en el primer intento y se reutiliza en los reintentos: si el
  // servidor ya cobró pero la respuesta se perdió por la red, reintentar
  // con la misma key hace que el servidor devuelva el resultado ya
  // registrado en vez de cobrar dos veces.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  // Función "beneficiarios": de quién se cobra (todas marcadas = pago completo).
  const conBeneficiarios = useFuncion("beneficiarios");
  const [eligiendo, setEligiendo] = useState<Persona<CuotaVencidaItem>[] | null>(null);
  const [personasSel, setPersonasSel] = useState<string[]>([]);
  const [personasCobro, setPersonasCobro] = useState<string[] | undefined>(undefined);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  if (total <= 0 && !resultado && !sinRecibo) return null;

  /** Con beneficiarios se elige de quién; sin ellos, la confirmación de siempre. */
  async function solicitarCobro() {
    if (idempotencyKey !== null) return cobrar({ esReintento: true, personas: personasCobro });
    if (conBeneficiarios && ownerId) {
      const items = await itemsCobroVencido(ownerId, clienteId, new Date());
      if (hayBeneficiarios(items)) {
        const personas = agruparPorPersona(items, clienteNombre ?? "Titular", (i) => i.pendiente);
        setPersonasSel(personas.map((p) => p.clave));
        setEligiendo(personas);
        return;
      }
    }
    return cobrar();
  }

  async function cobrar(opts?: { esReintento?: boolean; personas?: string[]; yaConfirmado?: boolean }) {
    const personas = opts?.personas;
    setPersonasCobro(personas);
    if (!opts?.esReintento && !opts?.yaConfirmado) {
      const ok = await confirmar(
        `Vas a registrar el pago completo de ${cuotas} cuota(s) por un total de ${formatMoneda(total)} (incluye vencidas y próximas a vencer). ¿Confirmar?`
      );
      if (!ok) return;
    }
    setCargando(true);
    setError(null);
    try {
      // El desglose se calcula ANTES de guardar: si termina en la cola, el
      // efecto optimista marca las cuotas como pagadas y ya no habría nada
      // que desglosar. Sale de Dexie (ver getCobroVencidoDetalle).
      const detalle = ownerId ? await getCobroVencidoDetalle(ownerId, clienteId, new Date(), personas) : null;
      const clave = idempotencyKey ?? crypto.randomUUID();
      setIdempotencyKey(clave);
      const r = await guardarOperacion<ResultadoCobroVencidas>({
        ownerId,
        clave,
        lote: [{ type: "cliente.cobrarVencidas", payload: { clienteId, ...(personas ? { personas } : {}) } }],
      });
      if (personas && ownerId) {
        // Solo se cobró a algunas personas: lo demás sigue pendiente.
        const resto = await itemsCobroVencido(ownerId, clienteId, new Date());
        const restantes = resto.filter((i) => !personas.includes(i.beneficiarioId ?? "__titular__"));
        setTotal(Math.round(restantes.reduce((s, i) => s + i.pendiente, 0) * 100) / 100);
        setCuotas(restantes.length);
      } else {
        setTotal(0);
        setCuotas(0);
      }
      if (r.enServidor) {
        setResultado(r.datos);
        // La caché local no se entera sola del cobro hecho en el servidor.
        if (ownerId) await syncContratas(ownerId);
        router.refresh();
      } else {
        setOfflinePendiente(true);
        if (detalle) setResultado(detalle);
        else setSinRecibo(true);
      }
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo registrar el cobro"));
    } finally {
      setCargando(false);
    }
  }

  if (sinRecibo) {
    return (
      <Card className={cn("border-pagado/30", enFila && "col-span-2")}>
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium text-pagado">Cobro guardado en el teléfono</p>
          <p className="text-xs text-muted-foreground">
            Se aplicó localmente y se sincronizará con el servidor en cuanto
            haya conexión.{" "}
            {reciboAutomatico
              ? "El recibo se enviará solo por WhatsApp al sincronizar."
              : "El recibo de WhatsApp se podrá enviar después, desde el detalle de cada contrata."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (resultado) {
    const mensaje = construirMensaje(nombreApp, resultado);
    const link = linkWhatsApp(resultado.clienteTelefono, mensaje);

    return (
      <Card className={cn("border-pagado/30", enFila && "col-span-2")}>
        <CardContent className="space-y-3 p-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {offlinePendiente ? "Cobro guardado en el teléfono" : "Cobro registrado"}
            </p>
            <p className="text-2xl font-bold text-pagado">
              {formatMoneda(resultado.total)}
            </p>
            {offlinePendiente && (
              <p className="text-xs text-muted-foreground">
                Se sube al servidor al sincronizar.
                {!reciboAutomatico && " El recibo ya se puede enviar."}
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
                  <span className="font-medium">{TIPO_LABEL[c.tipo]}</span>
                  <span className="font-semibold">
                    {formatMoneda(c.subtotal)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.cuotas
                    .map((q) => `Cuota ${q.numeroCuota}/${c.numCuotas}`)
                    .join(", ")}
                </p>
              </li>
            ))}
          </ul>
          <SeguimientoRecibo
            ownerId={ownerId}
            telefono={resultado.clienteTelefono}
            claves={idempotencyKey ? [idempotencyKey] : []}
            botonManual={
              <Button className="w-full" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" /> Enviar recibo por WhatsApp
                </a>
              </Button>
            }
          />
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setResultado(null);
              // Si quedó algo por cobrar (se cobró solo a algunas personas),
              // el siguiente cobro es una operación nueva.
              setIdempotencyKey(null);
            }}
          >
            Cerrar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalElegido = eligiendo
    ? Math.round(eligiendo.filter((p) => personasSel.includes(p.clave)).reduce((s, p) => s + p.total, 0) * 100) / 100
    : 0;
  const popupPersonas =
    eligiendo && montado
      ? createPortal(
          <Popup open onClose={() => setEligiendo(null)} className="max-w-sm">
            <p className="text-sm font-semibold">Cobrar pendiente</p>
            <p className="text-xs text-muted-foreground">¿De quién cobras? (pago completo de sus cuotas)</p>
            <div className="pt-2">
              <ElegirPersonas
                personas={eligiendo}
                seleccion={personasSel}
                onChange={setPersonasSel}
                detalle={(p) => `${p.items.length} cuota${p.items.length === 1 ? "" : "s"}`}
              />
            </div>
            <p className="py-2 text-3xl font-bold text-pagado">{formatMoneda(totalElegido)}</p>
            <div className="flex flex-col gap-2">
              <Button
                disabled={personasSel.length === 0}
                onClick={() => {
                  const todas = personasSel.length === eligiendo.length;
                  setEligiendo(null);
                  void cobrar({ yaConfirmado: true, personas: todas ? undefined : personasSel });
                }}
              >
                {personasSel.length === eligiendo.length ? "Cobrar todo" : "Cobrar seleccionados"}
              </Button>
              <Button variant="ghost" onClick={() => setEligiendo(null)}>
                Cancelar
              </Button>
            </div>
          </Popup>,
          document.body
        )
      : null;

  return (
    <div className={cn("space-y-1.5", enFila && "min-w-0")}>
      {popupPersonas}
      <Button
        className={cn("w-full min-w-0", enFila && "h-auto py-1.5")}
        variant="default"
        disabled={cargando}
        onClick={() => void solicitarCobro()}
      >
        <CircleDollarSign className="size-4" />
        {/*
          `truncate` porque el Button base es `whitespace-nowrap`: sin esto
          una etiqueta más larga que el botón se sale de la píldora en vez
          de recortarse.

          A media fila la etiqueta va en dos renglones. Medido en un celular
          de 375px: el texto dispone de 83px y "Cobrar $5,000.00" necesita
          120px en una sola línea — bajarle la fuente no alcanzaba, y
          recortar el monto (que es EL dato del botón) no es opción. El
          número de cuotas no se pierde: el confirm previo al cobro lo dice
          completo antes de aplicar nada.
        */}
        {cargando || error ? (
          <span className="truncate">
            {cargando ? "Registrando…" : "Reintentar cobro"}
          </span>
        ) : enFila ? (
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-[11px] font-normal opacity-90">Cobrar</span>
            <span className="truncate text-sm font-semibold">
              {formatMoneda(total)}
            </span>
          </span>
        ) : (
          <span className="truncate">
            {`Cobrar pendiente · ${formatMoneda(total)} (${cuotas} cuota${cuotas === 1 ? "" : "s"})`}
          </span>
        )}
      </Button>
      {error && (
        <p className="text-center text-xs text-destructive">
          {error}. Si el cobro ya se había registrado, reintentar no lo
          duplicará.
        </p>
      )}
    </div>
  );
}
