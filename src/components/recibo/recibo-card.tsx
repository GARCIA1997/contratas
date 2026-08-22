import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TipoContrata } from "@prisma/client";
import { formatMoneda } from "@/lib/utils";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

/* ── Paleta ───────────────────────────────────────────────────────────────
 * Colores fijos (no tokens de Tailwind) a propósito: el recibo es un
 * documento que recibe el CLIENTE por WhatsApp, así que debe verse idéntico
 * sin importar si quien lo genera trae la app en tema claro u oscuro.      */
const TINTA = "#0b1220";
const TENUE = "#64748b";
const LINEA = "#e6eaf2";
const FILA = "#f5f7fb";

const TONO = {
  pagado: { fg: "#0f7a3d", bg: "#e6f7ed" },
  parcial: { fg: "#a86008", bg: "#fdf1dc" },
  entrega: { fg: "#1d4ed8", bg: "#e6edfd" },
  vencido: { fg: "#b3261e", bg: "#fdeaea" },
  hoy: { fg: "#a86008", bg: "#fdf1dc" },
  proximo: { fg: "#1d4ed8", bg: "#e6edfd" },
} as const;

type Tono = keyof typeof TONO;

/* ── Tipos públicos ─────────────────────────────────────────────────────── */

export type ReciboCuota = {
  numeroCuota: number;
  monto: number;
};

export type ReciboContrataGrupo = {
  tipo: TipoContrata;
  numCuotas: number;
  /** Capital prestado — el "de cuánto es la contrata". */
  montoContrata: number;
  /** Lo que queda por pagar tras este cobro. */
  saldoTrasCobro: number;
  subtotal: number;
  cuotas: ReciboCuota[];
};

export type ReciboCuotaPendiente = {
  numeroCuota: number;
  numCuotas: number;
  tipo: TipoContrata;
  montoContrata: number;
  pendiente: number;
  /** Positivo = vencida hace N días · 0 = hoy · negativo = vence en N días. */
  diasAtraso: number;
};

/** Una contrata activa dentro del estado de cuenta. */
export type ReciboContrataEstado = {
  tipo: TipoContrata;
  montoContrata: number;
  cuotasPagadas: number;
  numCuotas: number;
  saldo: number;
  atrasada: boolean;
};

export type ReciboAbono = {
  fecha: string;
  monto: number;
};

type Base = {
  nombreApp: string;
  logoDataUri: string | null;
  colorPrimario: string;
  hechoPor: string | null;
  clienteNombre: string;
  fecha: Date;
  folio: string;
};

export type ReciboCardProps = Base &
  (
    | {
        variante: "cobro";
        total: number;
        contratas: ReciboContrataGrupo[];
      }
    | {
        variante: "entrega";
        tipo: TipoContrata;
        monto: number;
        abono: number;
        numCuotas: number;
        /** Fechas programadas (ISO ya formateado a texto legible). */
        fechasPago: { numeroCuota: number; fecha: string }[];
      }
    | {
        variante: "recordatorio";
        total: number;
        diasAtrasoMax: number;
        cuotas: ReciboCuotaPendiente[];
      }
    | {
        variante: "estado";
        /**
         * Solo contratas activas — y los tres totales se calculan sobre ESE
         * subconjunto, no sobre el histórico: si el cliente ve tres cifras
         * arriba y abajo un listado que no las suma, el documento pierde
         * credibilidad justo cuando más importa.
         */
        capitalPrestado: number;
        totalAbonado: number;
        saldoPendiente: number;
        contratas: ReciboContrataEstado[];
      }
    | {
        variante: "estadoDeudor";
        deudaInicial: number;
        abonado: number;
        saldo: number;
        abonos: ReciboAbono[];
      }
  );

/* ── Piezas ─────────────────────────────────────────────────────────────── */

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "8px 0",
        fontSize: 13.5,
        borderBottom: `1px solid ${LINEA}`,
      }}
    >
      <span style={{ color: TENUE, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

const rotulo: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: TENUE,
  margin: "0 0 8px",
};

const cifra: CSSProperties = {
  fontFamily: "ui-monospace, Menlo, monospace",
  fontVariantNumeric: "tabular-nums",
};

function CuotaFila({
  etiqueta,
  monto,
  nota,
}: {
  etiqueta: string;
  monto: string;
  nota?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        padding: "9px 11px",
        background: FILA,
        borderRadius: 9,
        marginBottom: 6,
        fontSize: 13,
      }}
    >
      <span style={{ color: TENUE }}>
        {etiqueta}
        {nota && (
          <span style={{ display: "block", fontSize: 11, opacity: 0.8 }}>{nota}</span>
        )}
      </span>
      <span style={{ ...cifra, fontWeight: 600, flexShrink: 0 }}>{monto}</span>
    </div>
  );
}

/** Bloque de 3 datos en fila — el resumen del plan en la variante entrega. */
function TresDatos({ datos }: { datos: { valor: string; pie: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      {datos.map((d) => (
        <div
          key={d.pie}
          style={{
            flex: 1,
            background: FILA,
            borderRadius: 10,
            padding: "11px 8px",
            textAlign: "center",
          }}
        >
          <div style={{ ...cifra, fontSize: 15, fontWeight: 700, color: TINTA }}>
            {d.valor}
          </div>
          <div style={{ fontSize: 10, color: TENUE, marginTop: 2 }}>{d.pie}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Tarjeta ────────────────────────────────────────────────────────────── */

/**
 * Tarjeta que se captura como imagen (html-to-image) y se comparte por
 * WhatsApp. Tres propósitos con la misma identidad visual:
 *
 *  · cobro        — confirma un pago recibido.
 *  · entrega      — comprobante de una contrata recién entregada, con el
 *                   plan de pagos completo.
 *  · recordatorio — avisa de un pago por vencer o vencido.
 *
 * Regla de contenido: el recibo confirma, no regaña. En "cobro" nunca se
 * menciona el atraso de una cuota ya cubierta; el atraso solo aparece en
 * "recordatorio", donde sí es información accionable.
 */
export const ReciboCard = forwardRef<HTMLDivElement, ReciboCardProps>(
  function ReciboCard(props, ref) {
    const { nombreApp, logoDataUri, colorPrimario, hechoPor, clienteNombre, fecha, folio } =
      props;

    let subtitulo: string;
    let tono: Tono;
    let sello: string;
    let captionMonto: string;
    let montoHero: number;

    if (props.variante === "cobro") {
      subtitulo = "Recibo de pago";
      tono = "pagado";
      sello = "Pagado";
      captionMonto = "Total cobrado";
      montoHero = props.total;
    } else if (props.variante === "entrega") {
      subtitulo = "Comprobante de entrega";
      tono = "entrega";
      sello = "Entregado";
      captionMonto = "Monto entregado";
      montoHero = props.monto;
    } else if (props.variante === "recordatorio") {
      subtitulo = "Recordatorio de pago";
      tono =
        props.diasAtrasoMax > 0 ? "vencido" : props.diasAtrasoMax === 0 ? "hoy" : "proximo";
      sello =
        props.diasAtrasoMax > 0 ? "Vencido" : props.diasAtrasoMax === 0 ? "Hoy" : "Por vencer";
      captionMonto = "Total a pagar";
      montoHero = props.total;
    } else if (props.variante === "estado") {
      const conAtraso = props.contratas.some((c) => c.atrasada);
      subtitulo = "Estado de cuenta";
      tono = conAtraso ? "vencido" : props.saldoPendiente > 0 ? "proximo" : "pagado";
      sello = conAtraso ? "Con atraso" : props.saldoPendiente > 0 ? "Al corriente" : "Sin adeudo";
      captionMonto = "Saldo pendiente";
      montoHero = props.saldoPendiente;
    } else {
      subtitulo = "Estado de cuenta";
      tono = props.saldo > 0 ? "vencido" : "pagado";
      sello = props.saldo > 0 ? "Pendiente" : "Liquidado";
      captionMonto = "Saldo restante";
      montoHero = props.saldo;
    }

    const acento = TONO[tono];

    return (
      <div
        ref={ref}
        style={{
          width: 380,
          background: "#ffffff",
          color: TINTA,
          borderRadius: 16,
          overflow: "hidden",
          fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            background: TINTA,
            color: "#fff",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            gap: 13,
          }}
        >
          {logoDataUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUri}
              alt=""
              width={52}
              height={52}
              style={{
                width: 52,
                height: 52,
                borderRadius: 13,
                objectFit: "cover",
                flexShrink: 0,
                background: "#fff",
              }}
            />
          ) : (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 13,
                background: colorPrimario,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 24,
                flexShrink: 0,
              }}
            >
              {nombreApp.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>
              {nombreApp}
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 1 }}>{subtitulo}</div>
            {hechoPor && (
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                Atendido por {hechoPor}
              </div>
            )}
          </div>
        </div>

        {/* Monto principal + sello */}
        <div
          style={{
            padding: "20px 20px 18px",
            textAlign: "center",
            borderBottom: `1px solid ${LINEA}`,
          }}
        >
          <div
            style={{
              display: "inline-block",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: acento.bg,
              color: acento.fg,
              padding: "5px 11px",
              borderRadius: 999,
              marginBottom: 12,
            }}
          >
            {sello}
          </div>
          <div style={{ fontSize: 12, color: TENUE, marginBottom: 3 }}>{captionMonto}</div>
          <div style={{ ...cifra, fontSize: 38, fontWeight: 700, letterSpacing: "-0.025em" }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: TENUE }}>$</span>
            {montoHero.toLocaleString("es-MX", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          {props.variante === "recordatorio" && (
            <div style={{ fontSize: 12.5, color: acento.fg, fontWeight: 600, marginTop: 6 }}>
              {props.diasAtrasoMax > 0
                ? `Vencido hace ${props.diasAtrasoMax} día${props.diasAtrasoMax === 1 ? "" : "s"}`
                : props.diasAtrasoMax === 0
                  ? "Vence hoy"
                  : `Vence en ${-props.diasAtrasoMax} día${-props.diasAtrasoMax === 1 ? "" : "s"}`}
            </div>
          )}
        </div>

        {/* Cuerpo */}
        <div style={{ padding: "14px 20px 18px" }}>
          <Fila k="Cliente" v={clienteNombre} />
          {props.variante === "entrega" && <Fila k="Plan" v={TIPO_LABEL[props.tipo]} />}
          <Fila
            k={
              props.variante === "entrega"
                ? "Entregado"
                : props.variante === "estado" || props.variante === "estadoDeudor"
                  ? "Corte al"
                  : "Fecha"
            }
            v={format(fecha, "d MMM yyyy, h:mm a", { locale: es })}
          />

          <div style={{ height: 16 }} />

          {props.variante === "cobro" && <DetalleCobro contratas={props.contratas} />}
          {props.variante === "entrega" && (
            <DetalleEntrega
              abono={props.abono}
              numCuotas={props.numCuotas}
              fechasPago={props.fechasPago}
            />
          )}
          {props.variante === "recordatorio" && <DetalleRecordatorio cuotas={props.cuotas} />}
          {props.variante === "estado" && (
            <DetalleEstado
              capitalPrestado={props.capitalPrestado}
              totalAbonado={props.totalAbonado}
              contratas={props.contratas}
            />
          )}
          {props.variante === "estadoDeudor" && (
            <DetalleEstadoDeudor
              deudaInicial={props.deudaInicial}
              abonado={props.abonado}
              abonos={props.abonos}
            />
          )}
        </div>

        {/* Pie */}
        <div
          style={{
            padding: "13px 20px 16px",
            borderTop: `1px dashed ${LINEA}`,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 10.5,
            color: TENUE,
          }}
        >
          <span style={cifra}>Folio {folio}</span>
          <span>Generado por {nombreApp}</span>
        </div>
      </div>
    );
  }
);

/* ── Detalle por variante ───────────────────────────────────────────────── */

function DetalleCobro({ contratas }: { contratas: ReciboContrataGrupo[] }) {
  const varias = contratas.length > 1;
  return (
    <div>
      <p style={rotulo}>{varias ? "Detalle por contrata" : "Cuotas cubiertas"}</p>
      {contratas.map((c, i) => (
        <div key={i} style={{ marginBottom: i === contratas.length - 1 ? 0 : 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 7,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>
              {TIPO_LABEL[c.tipo]}
              <span style={{ fontWeight: 500, color: TENUE }}>
                {" "}
                · préstamo de {formatMoneda(c.montoContrata)}
              </span>
            </span>
            {varias && (
              <span style={{ ...cifra, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {formatMoneda(c.subtotal)}
              </span>
            )}
          </div>
          {c.cuotas.map((q) => (
            <CuotaFila
              key={q.numeroCuota}
              etiqueta={`Cuota ${q.numeroCuota} de ${c.numCuotas}`}
              monto={formatMoneda(q.monto)}
            />
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 11px 0",
              fontSize: 12.5,
            }}
          >
            <span style={{ color: TENUE }}>
              {c.saldoTrasCobro > 0 ? "Te resta por pagar" : "Contrata liquidada"}
            </span>
            <span
              style={{
                ...cifra,
                fontWeight: 700,
                color: c.saldoTrasCobro > 0 ? TINTA : TONO.pagado.fg,
              }}
            >
              {c.saldoTrasCobro > 0 ? formatMoneda(c.saldoTrasCobro) : "$0.00"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cuántas fechas se listan antes de resumir (un plan de 52 semanas no cabe). */
const MAX_FECHAS = 6;

function DetalleEntrega({
  abono,
  numCuotas,
  fechasPago,
}: {
  abono: number;
  numCuotas: number;
  fechasPago: { numeroCuota: number; fecha: string }[];
}) {
  const total = Math.round(abono * numCuotas * 100) / 100;
  const ordenadas = [...fechasPago].sort((a, b) => a.numeroCuota - b.numeroCuota);
  const visibles = ordenadas.slice(0, MAX_FECHAS);
  const restantes = ordenadas.length - visibles.length;
  const ultima = ordenadas[ordenadas.length - 1];

  return (
    <div>
      <p style={rotulo}>Tu plan de pagos</p>
      <TresDatos
        datos={[
          { valor: String(numCuotas), pie: "pagos" },
          { valor: formatMoneda(abono), pie: "cada uno" },
          { valor: formatMoneda(total), pie: "total a pagar" },
        ]}
      />

      <p style={rotulo}>Calendario</p>
      {visibles.map((p) => (
        <CuotaFila
          key={p.numeroCuota}
          etiqueta={`Pago ${p.numeroCuota} de ${numCuotas}`}
          monto={p.fecha}
        />
      ))}
      {restantes > 0 && ultima && (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: TENUE, textAlign: "center" }}>
          y {restantes} pago{restantes === 1 ? "" : "s"} más, hasta el {ultima.fecha}
        </p>
      )}
    </div>
  );
}

function DetalleRecordatorio({ cuotas }: { cuotas: ReciboCuotaPendiente[] }) {
  /* Se agrupa por contrata para que un cliente con varios préstamos entienda
     de cuál es cada cuota, en vez de ver una lista plana de números. */
  const grupos = new Map<string, { tipo: TipoContrata; montoContrata: number; numCuotas: number; items: ReciboCuotaPendiente[] }>();
  for (const q of cuotas) {
    const clave = `${q.tipo}-${q.montoContrata}-${q.numCuotas}`;
    const previo = grupos.get(clave);
    if (previo) previo.items.push(q);
    else
      grupos.set(clave, {
        tipo: q.tipo,
        montoContrata: q.montoContrata,
        numCuotas: q.numCuotas,
        items: [q],
      });
  }

  return (
    <div>
      <p style={rotulo}>Pagos pendientes</p>
      {Array.from(grupos.values()).map((g, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>
            {TIPO_LABEL[g.tipo]}
            <span style={{ fontWeight: 500, color: TENUE }}>
              {" "}
              · préstamo de {formatMoneda(g.montoContrata)}
            </span>
          </div>
          {g.items.map((q) => (
            <CuotaFila
              key={q.numeroCuota}
              etiqueta={`Cuota ${q.numeroCuota} de ${g.numCuotas}`}
              nota={
                q.diasAtraso > 0
                  ? `${q.diasAtraso} día${q.diasAtraso === 1 ? "" : "s"} de atraso`
                  : q.diasAtraso === 0
                    ? "Vence hoy"
                    : `Vence en ${-q.diasAtraso} día${-q.diasAtraso === 1 ? "" : "s"}`
              }
              monto={formatMoneda(q.pendiente)}
            />
          ))}
        </div>
      ))}
      <Aviso>
        Si ya realizaste este pago, ignora este mensaje. ¡Gracias por tu preferencia!
      </Aviso>
    </div>
  );
}

function Progreso({ hechas, total, atrasada }: { hechas: number; total: number; atrasada: boolean }) {
  const pct = total > 0 ? Math.min(100, Math.round((hechas / total) * 100)) : 0;
  return (
    <div style={{ height: 5, borderRadius: 999, background: LINEA, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 999,
          background: atrasada ? TONO.vencido.fg : TONO.pagado.fg,
        }}
      />
    </div>
  );
}

function DetalleEstado({
  capitalPrestado,
  totalAbonado,
  contratas,
}: {
  capitalPrestado: number;
  totalAbonado: number;
  contratas: ReciboContrataEstado[];
}) {
  return (
    <div>
      <TresDatos
        datos={[
          { valor: formatMoneda(capitalPrestado), pie: "prestado" },
          { valor: formatMoneda(totalAbonado), pie: "abonado" },
          { valor: String(contratas.length), pie: contratas.length === 1 ? "contrata" : "contratas" },
        ]}
      />

      <p style={rotulo}>
        {contratas.length === 1 ? "Tu contrata activa" : "Tus contratas activas"}
      </p>

      {contratas.length === 0 ? (
        <Aviso>No tienes contratas activas en este momento.</Aviso>
      ) : (
        contratas.map((c, i) => (
          <div
            key={i}
            style={{
              padding: "10px 12px",
              background: FILA,
              borderRadius: 10,
              marginBottom: 7,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 7,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                {TIPO_LABEL[c.tipo]}
                <span style={{ fontWeight: 500, color: TENUE }}>
                  {" "}
                  · préstamo de {formatMoneda(c.montoContrata)}
                </span>
              </span>
              {c.atrasada && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    background: TONO.vencido.bg,
                    color: TONO.vencido.fg,
                    padding: "2px 7px",
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  Atrasada
                </span>
              )}
            </div>
            <Progreso hechas={c.cuotasPagadas} total={c.numCuotas} atrasada={c.atrasada} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 7,
                fontSize: 12,
              }}
            >
              <span style={{ color: TENUE }}>
                {c.cuotasPagadas} de {c.numCuotas} cuotas pagadas
              </span>
              <span style={{ ...cifra, fontWeight: 700 }}>
                {formatMoneda(c.saldo)}
                <span style={{ fontWeight: 500, color: TENUE }}> restante</span>
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** Últimos abonos que se listan antes de resumir. */
const MAX_ABONOS = 8;

function DetalleEstadoDeudor({
  deudaInicial,
  abonado,
  abonos,
}: {
  deudaInicial: number;
  abonado: number;
  abonos: ReciboAbono[];
}) {
  // Los más recientes primero: es lo que el deudor quiere confirmar.
  const recientes = [...abonos].reverse();
  const visibles = recientes.slice(0, MAX_ABONOS);
  const restantes = recientes.length - visibles.length;

  return (
    <div>
      <TresDatos
        datos={[
          { valor: formatMoneda(deudaInicial), pie: "deuda inicial" },
          { valor: formatMoneda(abonado), pie: "abonado" },
          { valor: String(abonos.length), pie: abonos.length === 1 ? "abono" : "abonos" },
        ]}
      />

      <p style={rotulo}>Historial de abonos</p>
      {visibles.length === 0 ? (
        <Aviso>Todavía no hay abonos registrados.</Aviso>
      ) : (
        <>
          {visibles.map((a, i) => (
            <CuotaFila key={i} etiqueta={a.fecha} monto={formatMoneda(a.monto)} />
          ))}
          {restantes > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: TENUE, textAlign: "center" }}>
              y {restantes} abono{restantes === 1 ? "" : "s"} más
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "10px 12px",
        background: FILA,
        borderRadius: 9,
        fontSize: 11.5,
        lineHeight: 1.5,
        color: TENUE,
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );
}
