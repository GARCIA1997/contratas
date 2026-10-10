import Link from "next/link";
import { panelWhatsApp, MAX_CUENTAS } from "@/lib/whatsapp-auto/admin";
import { CUPO_DIARIO } from "@/lib/whatsapp-auto/reglas";
import { fechaHora, haceCuanto, numero } from "@/components/monitor/formato";
import { Chips, Encabezado, KpiSimple, Tarjeta } from "@/components/monitor/ui";
import {
  BotonAccion,
  FormCambiarNumero,
  FormNuevaCuenta,
  IniciarCampana,
  RefrescoRapido,
} from "@/components/monitor/acciones-whatsapp";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { texto: string; clase: string }> = {
  CONECTADO: { texto: "Conectado", clase: "bg-secondary/20 text-secondary" },
  ESPERANDO_VINCULACION: { texto: "Esperando vinculación", clase: "bg-tertiary-container/30 text-tertiary" },
  DESCONECTADO: { texto: "Desconectado", clase: "bg-surface-container-high text-on-surface-variant" },
  BLOQUEADO: { texto: "Bloqueado", clase: "bg-error-container/40 text-error" },
};

const TIPO: Record<string, string> = {
  RECIBO: "Recibo",
  POR_VENCER: "Por vencer",
  VENCIDA: "Vencida",
  DEUDOR: "Deudor",
  PRESENTACION: "Presentación",
  CONFIRMACION_BAJA: "Confirmación",
};

const ESTADO_MSG: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ENVIANDO: "Enviando",
  ENVIADO: "Enviado",
  FALLIDO: "Fallido",
  CANCELADO: "Cancelado",
  REVISAR: "Por revisar",
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function Insignia({ estado, pausada }: { estado: string; pausada?: boolean }) {
  const e = ESTADO[estado] ?? ESTADO.DESCONECTADO;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("rounded px-2 py-0.5 font-label-sm text-label-sm", e.clase)}>{e.texto}</span>
      {pausada && <span className="rounded bg-tertiary-container/30 px-2 py-0.5 font-label-sm text-label-sm text-tertiary">Pausado</span>}
    </span>
  );
}

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: { cuenta?: string; seccion?: string; estado?: string; tipo?: string; rango?: string };
}) {
  const panel = await panelWhatsApp(searchParams.cuenta);
  const d = panel.detalle;
  const seccion = searchParams.seccion ?? "cola";
  const esperando = d?.cuenta.estado === "ESPERANDO_VINCULACION";

  return (
    <>
      <RefrescoRapido activo={esperando} />
      <Encabezado
        titulo="WhatsApp automático"
        subtitulo={`${panel.cuentas.length}/${MAX_CUENTAS} números · worker ${
          panel.workerVivo ? `vivo (latido ${haceCuanto(iso(panel.latidoEn))})` : "SIN LATIDO"
        }${panel.latido ? ` · ${panel.latido.rssMb} MB · CPU ${panel.latido.cpuPct}% · Baileys ${panel.latido.versionBaileys}` : ""}`}
      >
        {panel.paroGlobal ? (
          <BotonAccion cuerpo={{ accion: "paro_global", activo: false }} texto="Quitar paro global" icono="play_arrow" tono="primario" confirmar="¿Reanudar los envíos de todos los números?" />
        ) : (
          <BotonAccion cuerpo={{ accion: "paro_global", activo: true }} texto="Paro global" icono="block" tono="peligro" confirmar="Esto detiene AL INSTANTE los envíos de todos los números. ¿Continuar?" />
        )}
      </Encabezado>

      {panel.alertas.length > 0 && (
        <Tarjeta className="gap-space-xs">
          {panel.alertas.map((a, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-space-xs font-body-sm text-body-sm",
                a.nivel === "error" ? "text-error" : a.nivel === "aviso" ? "text-tertiary" : "text-on-surface-variant"
              )}
            >
              <span className="material-symbols-outlined text-[16px]">{a.nivel === "info" ? "info" : "warning"}</span>
              {a.cuentaId ? <Link href={`/monitor/whatsapp?cuenta=${a.cuentaId}`}>{a.texto}</Link> : a.texto}
            </div>
          ))}
        </Tarjeta>
      )}

      {/* 7.0 Tabla de números */}
      <Tarjeta className="gap-space-md overflow-x-auto">
        <table className="w-full min-w-[820px] text-left font-body-sm text-body-sm">
          <thead className="font-label-xs text-label-xs uppercase tracking-wider text-outline">
            <tr>
              <th className="py-1">Usuario</th>
              <th>Número</th>
              <th>Estado</th>
              <th>Hoy</th>
              <th>Cola</th>
              <th>Campaña</th>
              <th>Último error</th>
            </tr>
          </thead>
          <tbody>
            {panel.cuentas.map((c) => (
              <tr key={c.id} className={cn("border-t border-outline-variant/30", d?.cuenta.id === c.id && "bg-surface-container")}>
                <td className="py-2">
                  <Link className="text-primary hover:underline" href={`/monitor/whatsapp?cuenta=${c.id}`}>
                    {c.owner.nombre ?? c.owner.email}
                  </Link>
                  {!c.activo && <span className="ml-1 text-outline">(apagado por el usuario)</span>}
                </td>
                <td className="font-code-sm text-code-sm">{c.numero}</td>
                <td>
                  <Insignia estado={c.estado} pausada={c.pausadaPorAdmin || c.pausadaPorUsuario} />
                </td>
                <td className={cn(c.enviadosHoy > CUPO_DIARIO && "text-tertiary")}>
                  {c.enviadosHoy}/{CUPO_DIARIO}
                </td>
                <td>
                  {c.pendientes}
                  {c.revisar > 0 && <span className="ml-1 text-tertiary">· {c.revisar} revisar</span>}
                </td>
                <td>{c.campana ? `${c.campana.estado.toLowerCase()}` : "—"}</td>
                <td className="max-w-[260px] truncate text-on-surface-variant" title={c.ultimoError ?? ""}>
                  {c.ultimoError ?? "—"}
                </td>
              </tr>
            ))}
            {panel.cuentas.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-on-surface-variant">
                  Ningún número asignado todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {panel.cuentas.length < MAX_CUENTAS && (
          <FormNuevaCuenta usuarios={panel.usuariosSinNumero.map((u) => ({ id: u.id, etiqueta: u.nombre ? `${u.nombre} · ${u.email}` : u.email }))} />
        )}
      </Tarjeta>

      {d && (
        <>
          {/* 7.1 / 7.2 Encabezado del número y conexión */}
          <Tarjeta className="gap-space-md">
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <div className="flex flex-col gap-1">
                <span className="font-headline-sm text-headline-sm text-on-surface">
                  {d.cuenta.owner.nombre ?? d.cuenta.owner.email} · <span className="font-code-sm">{d.cuenta.numero}</span>
                </span>
                <span className="flex flex-wrap items-center gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                  <Insignia estado={d.cuenta.estado} pausada={d.cuenta.pausadaPorAdmin || d.cuenta.pausadaPorUsuario} />
                  {d.cuenta.conectadoDesde && d.cuenta.estado === "CONECTADO" && <>desde {fechaHora(d.cuenta.conectadoDesde.toISOString())}</>}
                  · última conexión {haceCuanto(iso(d.cuenta.ultimaConexion))}
                  · reconexiones hoy {d.reconexionesHoy} / 7 días {d.reconexiones7d}
                </span>
                {d.cuenta.pausadaPorUsuario && <span className="font-body-sm text-body-sm text-tertiary">Pausado por el usuario {haceCuanto(iso(d.cuenta.pausadaPorUsuarioEn))}</span>}
                {d.cuenta.pausadaPorAdmin && <span className="font-body-sm text-body-sm text-tertiary">{d.cuenta.pausaMotivo ?? "Pausado por el administrador"}</span>}
                {d.cuenta.ultimoError && <span className="font-body-sm text-body-sm text-error">{d.cuenta.ultimoError}</span>}
              </div>
              <div className="flex flex-wrap gap-space-xs">
                {d.cuenta.estado !== "CONECTADO" && (
                  <>
                    <BotonAccion cuerpo={{ accion: "vincular_codigo", cuentaId: d.cuenta.id }} texto="Código de vinculación" icono="pin" tono="primario" confirmar="Se descarta la sesión anterior (si hay) y se genera un código de 8 caracteres. ¿Continuar?" />
                    <BotonAccion cuerpo={{ accion: "vincular_qr", cuentaId: d.cuenta.id }} texto="QR" icono="qr_code_2" confirmar="Se descarta la sesión anterior (si hay) y se genera un QR. ¿Continuar?" />
                  </>
                )}
                {d.cuenta.pausadaPorAdmin ? (
                  <BotonAccion cuerpo={{ accion: "pausar", cuentaId: d.cuenta.id, pausada: false }} texto="Reanudar" icono="play_arrow" />
                ) : (
                  <BotonAccion cuerpo={{ accion: "pausar", cuentaId: d.cuenta.id, pausada: true }} texto="Pausar" icono="pause" />
                )}
                <BotonAccion cuerpo={{ accion: "desconectar", cuentaId: d.cuenta.id }} texto="Desvincular" icono="link_off" tono="peligro" confirmar="Se cierra la sesión en WhatsApp y se borran las llaves. Habrá que volver a vincular. ¿Continuar?" />
                <FormCambiarNumero cuentaId={d.cuenta.id} />
                <BotonAccion cuerpo={{ accion: "eliminar_cuenta", cuentaId: d.cuenta.id }} texto="Quitar número" icono="delete" tono="peligro" confirmar="Se elimina la cuenta con todo su historial, cola, opt-outs y bitácora propia. ¿Continuar?" />
              </div>
            </div>

            {esperando && (
              <div className="flex flex-wrap items-center gap-space-lg rounded-lg bg-surface-container p-space-md">
                {d.qrImagen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.qrImagen} alt="QR de vinculación" className="h-56 w-56 rounded bg-white p-2" />
                )}
                {d.cuenta.codigoVinculacion && (
                  <div className="flex flex-col gap-1">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Código de vinculación</span>
                    <span className="font-metric-num text-metric-num tracking-[0.3em] text-on-surface">
                      {d.cuenta.codigoVinculacion.slice(0, 4)}-{d.cuenta.codigoVinculacion.slice(4)}
                    </span>
                  </div>
                )}
                <span className="max-w-md font-body-sm text-body-sm text-on-surface-variant">
                  {d.cuenta.codigoVinculacion
                    ? "El usuario abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono, y escribe el código."
                    : d.qrImagen
                      ? "Escanea desde WhatsApp → Dispositivos vinculados → Vincular un dispositivo. El QR se renueva solo."
                      : "Esperando a que el worker genere la vinculación…"}
                  {d.cuenta.vinculacionExpira && <> Caduca {fechaHora(d.cuenta.vinculacionExpira.toISOString())}.</>}
                  {!panel.workerVivo && <b className="text-error"> El worker no está corriendo.</b>}
                </span>
              </div>
            )}

            {/* 7.3 Cupo del día */}
            <div className="grid grid-cols-2 gap-space-sm md:grid-cols-4">
              <KpiSimple
                titulo="Enviados hoy"
                icono="send"
                valor={`${numero(d.porTipoHoy.reduce((s, x) => s + x.n, 0))}/${CUPO_DIARIO}`}
                pie={d.porTipoHoy.map((x) => `${TIPO[x.tipo]} ${x.n}`).join(" · ") || "Sin envíos"}
              />
              <KpiSimple
                titulo="Acuses hoy"
                icono="done_all"
                valor={numero(d.acksHoy.find((a) => a.ack === "LEIDO")?.n ?? 0)}
                pie={`leídos · entregados ${d.acksHoy.find((a) => a.ack === "ENTREGADO")?.n ?? 0} · sin acuse ${d.acksHoy.find((a) => a.ack === null)?.n ?? 0}`}
              />
              <KpiSimple
                titulo="Próximo envío"
                icono="schedule"
                valor={d.proximo ? TIPO[d.proximo.tipo] : "—"}
                pie={d.proximo ? `programado ${fechaHora(d.proximo.programadoPara.toISOString())}` : "Cola vacía"}
              />
              <KpiSimple
                titulo="Configuración del usuario"
                icono="tune"
                valor={d.cuenta.activo ? "Activo" : "Apagado"}
                pie={[d.cuenta.recibos && "recibos", d.cuenta.porVencer && "por vencer", d.cuenta.vencidas && "vencidas", d.cuenta.deudores && "deudores"].filter(Boolean).join(" · ") || "Ningún tipo activo"}
              />
            </div>
          </Tarjeta>

          <Chips
            base="/monitor/whatsapp"
            param="seccion"
            activo={seccion}
            extra={{ cuenta: d.cuenta.id }}
            opciones={[
              { valor: "cola", texto: "Cola", cuenta: d.porEstado.reduce((s, x) => s + x.n, 0) },
              { valor: "revertidos", texto: "Cobros revertidos", cuenta: d.revertidos.length },
              { valor: "campana", texto: "Presentación" },
              { valor: "optouts", texto: "Opt-outs", cuenta: d.optOuts.filter((o) => o.activo).length },
              { valor: "procesos", texto: "Procesos" },
              { valor: "bitacora", texto: "Bitácora" },
            ]}
          />

          {/* 7.4 Cola de salida */}
          {seccion === "cola" && (
            <Tarjeta className="gap-space-md overflow-x-auto">
              <div className="flex flex-wrap gap-space-sm">
                <Chips
                  base="/monitor/whatsapp"
                  param="estado"
                  activo={searchParams.estado ?? ""}
                  extra={{ cuenta: d.cuenta.id, seccion: "cola", tipo: searchParams.tipo }}
                  opciones={[
                    { valor: "", texto: "Todos" },
                    ...Object.keys(ESTADO_MSG).map((e) => ({
                      valor: e,
                      texto: ESTADO_MSG[e],
                      cuenta: d.porEstado.find((x) => x.estado === e)?.n ?? 0,
                    })),
                  ]}
                />
                <Chips
                  base="/monitor/whatsapp"
                  param="tipo"
                  activo={searchParams.tipo ?? ""}
                  extra={{ cuenta: d.cuenta.id, seccion: "cola", estado: searchParams.estado }}
                  opciones={[{ valor: "", texto: "Todo tipo" }, ...Object.keys(TIPO).map((t) => ({ valor: t, texto: TIPO[t] }))]}
                />
              </div>
              <table className="w-full min-w-[900px] text-left font-body-sm text-body-sm">
                <thead className="font-label-xs text-label-xs uppercase tracking-wider text-outline">
                  <tr>
                    <th className="py-1">Destinatario</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Programado / enviado</th>
                    <th>Acuse</th>
                    <th>Motivo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.mensajes
                    .filter((m) => (!searchParams.estado || m.estado === searchParams.estado) && (!searchParams.tipo || m.tipo === searchParams.tipo))
                    .map((m) => (
                      <tr key={m.id} className="border-t border-outline-variant/30 align-top">
                        <td className="py-2">
                          {m.destinatarioNombre}
                          <div className="font-code-sm text-code-sm text-outline">{m.telefono}</div>
                        </td>
                        <td>{TIPO[m.tipo]}{m.numeroCuota ? ` · cuota ${m.numeroCuota}` : ""}</td>
                        <td className={cn(m.estado === "FALLIDO" && "text-error", m.estado === "REVISAR" && "text-tertiary")}>
                          {ESTADO_MSG[m.estado]}
                          {m.envio?.conPresentacion && <div className="text-outline">con presentación</div>}
                        </td>
                        <td>{fechaHora((m.envio?.enviadoEn ?? m.programadoPara).toISOString())}</td>
                        <td>{m.envio?.ack?.toLowerCase() ?? "—"}</td>
                        <td className="max-w-[240px] text-on-surface-variant">{m.motivo ?? ""}</td>
                        <td className="whitespace-nowrap">
                          {(m.texto || m.envio?.texto) && (
                            <details>
                              <summary className="cursor-pointer text-primary">Ver texto</summary>
                              <pre className="mt-1 max-w-[420px] whitespace-pre-wrap rounded bg-surface-container-lowest p-2 font-code-sm text-code-sm">
                                {m.envio?.texto ?? m.texto}
                              </pre>
                            </details>
                          )}
                          <div className="mt-1 flex gap-1">
                            {["PENDIENTE", "FALLIDO", "REVISAR"].includes(m.estado) && (
                              <BotonAccion cuerpo={{ accion: "cancelar_mensaje", mensajeId: m.id }} texto="Cancelar" />
                            )}
                            {m.estado === "FALLIDO" && (
                              <BotonAccion cuerpo={{ accion: "reintentar_mensaje", mensajeId: m.id }} texto="Reintentar" confirmar="¿Volver a intentar este mensaje?" />
                            )}
                            {m.estado === "REVISAR" && (
                              <BotonAccion
                                cuerpo={{ accion: "reintentar_mensaje", mensajeId: m.id }}
                                texto="Reenviar"
                                confirmar="No se sabe si este mensaje salió. Revisa el chat en el teléfono: reenviar solo si NO le llegó. ¿Reenviar?"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <span className="font-label-sm text-label-sm text-outline">Últimos 300 movimientos.</span>
            </Tarjeta>
          )}

          {seccion === "revertidos" && (
            <Tarjeta className="gap-space-sm">
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Recibos que ya se enviaron y cuyo cobro después se desmarcó o limpió. No se manda corrección automática: atiéndelos a mano y márcalos como atendidos.
              </span>
              {d.revertidos.length === 0 && <span className="text-on-surface-variant">Sin pendientes.</span>}
              {d.revertidos.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-space-sm border-t border-outline-variant/30 py-2 font-body-sm text-body-sm">
                  <span>
                    {m.destinatarioNombre} · <span className="font-code-sm">{m.telefono}</span> · {fechaHora(m.creadoEn.toISOString())}
                  </span>
                  <BotonAccion cuerpo={{ accion: "atender_revertido", mensajeId: m.id }} texto="Atendido" icono="check" />
                </div>
              ))}
            </Tarjeta>
          )}

          {/* 7.5 Campaña de presentación */}
          {seccion === "campana" && (
            <Tarjeta className="gap-space-md">
              {d.campana && d.campana.estado !== "TERMINADA" ? (
                <>
                  <div className="grid grid-cols-2 gap-space-sm md:grid-cols-4">
                    <KpiSimple titulo="Estado" icono="campaign" valor={d.campana.estado.toLowerCase()} pie={d.campana.pausaMotivo ?? `iniciada ${fechaHora(d.campana.iniciadaEn.toISOString())} por ${d.campana.iniciadaPor}`} />
                    <KpiSimple titulo="Enviados" icono="send" valor={`${d.campana.enviados}/${d.campana.total}`} pie={`faltan ${d.campana.faltan} · ~${Math.ceil(d.campana.faltan / 30)} días`} />
                    <KpiSimple titulo="Bajas hoy" icono="do_not_disturb_on" valor={String(d.campana.bajasHoy)} pie={`${d.campana.bajas} desde que inició`} />
                    <KpiSimple titulo="Rampa" icono="trending_up" valor="20 → 30 / día" pie="sube tras 3 días con envíos sin incidentes" />
                  </div>
                  <div className="flex gap-space-xs">
                    {d.campana.estado === "ACTIVA" ? (
                      <BotonAccion cuerpo={{ accion: "campana", campanaId: d.campana.id, operacion: "pausar" }} texto="Pausar" icono="pause" />
                    ) : (
                      <BotonAccion cuerpo={{ accion: "campana", campanaId: d.campana.id, operacion: "reanudar" }} texto="Reanudar" icono="play_arrow" confirmar="¿Reanudar la campaña de presentación?" />
                    )}
                    <BotonAccion cuerpo={{ accion: "campana", campanaId: d.campana.id, operacion: "terminar" }} texto="Terminar" icono="stop" tono="peligro" confirmar="Se cancela lo que falta por enviar. ¿Terminar la campaña?" />
                  </div>
                </>
              ) : (
                <>
                  {d.campana && (
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Última campaña terminada {fechaHora((d.campana.terminadaEn ?? d.campana.actualizadoEn).toISOString())}: {d.campana.enviados}/{d.campana.total} enviados, {d.campana.bajas} bajas.
                    </span>
                  )}
                  {d.cuenta.estado === "CONECTADO" ? (
                    <IniciarCampana cuentaId={d.cuenta.id} />
                  ) : (
                    <span className="text-on-surface-variant">El número debe estar conectado para iniciar una campaña.</span>
                  )}
                </>
              )}
            </Tarjeta>
          )}

          {/* 7.6 Opt-outs */}
          {seccion === "optouts" && (
            <Tarjeta className="gap-space-sm">
              {d.optOuts.length === 0 && <span className="text-on-surface-variant">Nadie ha pedido la baja.</span>}
              {d.optOuts.map((o) => (
                <div key={o.telefono} className="flex items-center justify-between gap-space-sm border-t border-outline-variant/30 py-2 font-body-sm text-body-sm">
                  <span>
                    <span className="font-code-sm">{o.telefono}</span> · “{o.mensaje}” · {fechaHora(o.fecha.toISOString())}
                    {!o.activo && <span className="ml-1 text-outline">(reactivado {o.reactivadoEn ? fechaHora(o.reactivadoEn.toISOString()) : ""})</span>}
                  </span>
                  {o.activo && (
                    <BotonAccion
                      cuerpo={{ accion: "reactivar_optout", cuentaId: d.cuenta.id, telefono: o.telefono }}
                      texto="Reactivar"
                      confirmar="Esta persona pidió no recibir mensajes. Solo reactívala si te lo pidió. ¿Continuar?"
                    />
                  )}
                </div>
              ))}
            </Tarjeta>
          )}

          {/* 7.7 Procesos */}
          {seccion === "procesos" && (
            <Tarjeta className="gap-space-sm overflow-x-auto">
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Recibos: se generan al guardar el cobro (no tiene corridas). Despachador: cada 5 s. Recordatorios: cada hora. Latido: cada 30 s. Limpieza: al arrancar y diario a las 3:00.
              </span>
              <table className="w-full min-w-[640px] text-left font-body-sm text-body-sm">
                <thead className="font-label-xs text-label-xs uppercase tracking-wider text-outline">
                  <tr>
                    <th className="py-1">Proceso</th>
                    <th>Inicio</th>
                    <th>Duración</th>
                    <th>Resultado</th>
                    <th>Procesados</th>
                  </tr>
                </thead>
                <tbody>
                  {d.procesos.map((p) => (
                    <tr key={p.id} className="border-t border-outline-variant/30">
                      <td className="py-1.5">{p.proceso}</td>
                      <td>{fechaHora(p.inicio.toISOString())}</td>
                      <td>{p.fin ? `${((p.fin.getTime() - p.inicio.getTime()) / 1000).toFixed(1)} s` : "en curso"}</td>
                      <td className={cn(p.ok === false && "text-error")}>{p.ok === null ? "—" : p.ok ? "OK" : p.error}</td>
                      <td>{p.procesados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          )}

          {/* 7.8 Bitácora */}
          {seccion === "bitacora" && (
            <Tarjeta className="gap-1">
              {d.bitacora.map((b) => (
                <div key={b.id} className="flex gap-space-sm border-t border-outline-variant/30 py-1.5 font-body-sm text-body-sm">
                  <span className="w-36 shrink-0 text-outline">{fechaHora(b.creadoEn.toISOString())}</span>
                  <span className={cn("w-44 shrink-0", b.tipo.startsWith("alerta") || b.tipo.startsWith("error") ? "text-error" : "text-on-surface")}>{b.tipo}</span>
                  <span className="truncate text-on-surface-variant">
                    {b.actor ? `${b.actor} · ` : ""}
                    {b.detalle ? JSON.stringify(b.detalle) : ""}
                  </span>
                </div>
              ))}
            </Tarjeta>
          )}
        </>
      )}
    </>
  );
}
