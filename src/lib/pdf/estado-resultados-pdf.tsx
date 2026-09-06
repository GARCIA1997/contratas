import {
  Circle,
  Document,
  G,
  Page,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type {
  EstadoResultados,
  MesEstado,
} from "@/lib/services/estado-resultados";
import { MIN_CUOTAS_PUNTUALIDAD } from "@/lib/services/estado-resultados";

/**
 * Estado de resultados completo en PDF: los mismos números y las mismas
 * gráficas que la pantalla, pero para imprimir o mandar por WhatsApp.
 *
 * Las gráficas se dibujan con las primitivas SVG de @react-pdf (Svg, Rect,
 * Circle, Polyline) en vez de incrustar una imagen: así el PDF sale
 * vectorial (se ve nítido al imprimir y al hacer zoom) y no hace falta
 * levantar un navegador headless en el servidor para capturar los canvas.
 *
 * La dona usa el mismo truco de `strokeDasharray` que la versión web —
 * evita el caso degenerado de una rebanada del 100%, donde un arco `path`
 * tiene el mismo punto de inicio y fin y no dibuja nada.
 */

// Paleta fija (no hay variables CSS en un PDF). Son los mismos tonos que
// --chart-1..3 en su versión de tema claro, para que el reporte impreso se
// reconozca como el de la pantalla.
const AZUL = "#0F7BFF";
const VERDE = "#00A86B";
const VIOLETA = "#8B5CF6";
const ROJO = "#DC2626";
const AMBAR = "#F59E0B";
const GRIS_LINEA = "#E5E7EB";
const TEXTO = "#1a1a1a";
const TEXTO_SUAVE = "#666666";

const COLOR_TIPO: Record<string, string> = {
  SEMANAL: AZUL,
  QUINCENAL: VERDE,
  MENSUAL: VIOLETA,
};

function moneda(n: number) {
  return `$${Math.round(n).toLocaleString("es-MX")}`;
}

function monedaCorta(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

const styles = StyleSheet.create({
  page: {
    padding: 34,
    paddingBottom: 54,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: TEXTO,
  },
  header: {
    marginBottom: 14,
    borderBottom: `2 solid ${AZUL}`,
    paddingBottom: 8,
  },
  appName: { fontSize: 17, fontWeight: 700, color: AZUL },
  titulo: { fontSize: 13, fontWeight: 700, marginTop: 3 },
  subtitulo: { fontSize: 8.5, color: TEXTO_SUAVE, marginTop: 2 },

  seccion: { marginTop: 13 },
  seccionTitulo: {
    fontSize: 10.5,
    fontWeight: 700,
    marginBottom: 6,
    color: TEXTO,
  },

  parrafo: { fontSize: 9, lineHeight: 1.5, marginBottom: 4, color: "#333333" },

  // Rejilla de métricas
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  celda: { width: "25%", paddingHorizontal: 3, marginBottom: 6 },
  caja: {
    border: `1 solid ${GRIS_LINEA}`,
    borderRadius: 4,
    padding: 7,
    height: 50,
  },
  cajaLabel: { fontSize: 7.5, color: TEXTO_SUAVE, marginBottom: 2 },
  cajaValor: { fontSize: 12, fontWeight: 700 },
  cajaDetalle: { fontSize: 7, color: TEXTO_SUAVE, marginTop: 2 },

  // Tablas
  tablaHead: {
    flexDirection: "row",
    borderBottom: `1 solid #cccccc`,
    paddingBottom: 4,
    marginBottom: 2,
  },
  tablaFila: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottom: `1 solid #f0f0f0`,
  },
  th: { fontSize: 8, color: TEXTO_SUAVE, fontWeight: 700 },
  td: { fontSize: 8.5 },

  leyenda: { flexDirection: "row", marginTop: 5, justifyContent: "center" },
  leyendaItem: { flexDirection: "row", alignItems: "center", marginHorizontal: 7 },
  leyendaSwatch: { width: 6, height: 6, borderRadius: 1, marginRight: 3 },
  leyendaTexto: { fontSize: 7.5, color: TEXTO_SUAVE },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 34,
    right: 34,
    fontSize: 7.5,
    color: "#999999",
    textAlign: "center",
  },
});

function Metrica({
  label,
  valor,
  detalle,
  color,
}: {
  label: string;
  valor: string;
  detalle?: string;
  color?: string;
}) {
  return (
    <View style={styles.celda}>
      <View style={styles.caja}>
        <Text style={styles.cajaLabel}>{label}</Text>
        <Text style={[styles.cajaValor, color ? { color } : {}]}>{valor}</Text>
        {detalle ? <Text style={styles.cajaDetalle}>{detalle}</Text> : null}
      </View>
    </View>
  );
}

/** Dona por `strokeDasharray` — ver comentario del encabezado del archivo. */
function Dona({
  rebanadas,
  size = 108,
  grosor = 17,
}: {
  rebanadas: { label: string; valor: number; color: string }[];
  size?: number;
  grosor?: number;
}) {
  const total = rebanadas.reduce((s, r) => s + Math.max(0, r.valor), 0);
  const radio = (size - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;

  if (total <= 0) {
    return (
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="none"
          stroke={GRIS_LINEA}
          strokeWidth={grosor}
        />
      </Svg>
    );
  }

  // A diferencia de la versión web, aquí cada rebanada arranca en el dash 0
  // y se ROTA hasta su posición: @react-pdf soporta `strokeDasharray` pero
  // no `strokeDashoffset`, así que la rotación es la única forma de apilar
  // las rebanadas una tras otra.
  let fraccionAcumulada = 0;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radio}
        fill="none"
        stroke={GRIS_LINEA}
        strokeWidth={grosor}
      />
      {rebanadas
        .filter((r) => r.valor > 0)
        .map((r) => {
          const fraccion = r.valor / total;
          const largo = fraccion * circunferencia;
          const giro = -90 + fraccionAcumulada * 360;
          fraccionAcumulada += fraccion;
          return (
            <G key={r.label} transform={`rotate(${giro}, ${size / 2}, ${size / 2})`}>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radio}
                fill="none"
                stroke={r.color}
                strokeWidth={grosor}
                strokeDasharray={`${largo} ${circunferencia - largo}`}
              />
            </G>
          );
        })}
    </Svg>
  );
}

function Leyenda({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <View style={styles.leyenda}>
      {items.map((i) => (
        <View key={i.label} style={styles.leyendaItem}>
          <View style={[styles.leyendaSwatch, { backgroundColor: i.color }]} />
          <Text style={styles.leyendaTexto}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Líneas de cobrado y ganancia sobre una cuadrícula de cuartos. */
function GraficaLinea({
  serie,
  ancho = 500,
  alto = 110,
}: {
  serie: MesEstado[];
  ancho?: number;
  alto?: number;
}) {
  const max = Math.max(1, ...serie.flatMap((m) => [m.cobrado, m.ganancia]));
  const n = serie.length;
  const x = (i: number) => (n <= 1 ? ancho / 2 : (i / (n - 1)) * ancho);
  const y = (v: number) => alto - (v / max) * alto;

  const puntos = (sel: (m: MesEstado) => number) =>
    serie.map((m, i) => `${x(i)},${y(sel(m))}`).join(" ");

  return (
    <Svg width={ancho} height={alto}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <Polyline
          key={f}
          points={`0,${alto * f} ${ancho},${alto * f}`}
          stroke={GRIS_LINEA}
          strokeWidth={0.7}
          fill="none"
        />
      ))}
      <Polyline
        points={puntos((m) => m.cobrado)}
        stroke={AZUL}
        strokeWidth={1.8}
        fill="none"
      />
      <Polyline
        points={puntos((m) => m.ganancia)}
        stroke={VERDE}
        strokeWidth={1.8}
        fill="none"
      />
    </Svg>
  );
}

/** Barras agrupadas: entregado vs cobrado por mes. */
function GraficaBarras({
  serie,
  ancho = 500,
  alto = 100,
}: {
  serie: MesEstado[];
  ancho?: number;
  alto?: number;
}) {
  const max = Math.max(1, ...serie.flatMap((m) => [m.colocado, m.cobrado]));
  const paso = ancho / serie.length;
  const anchoBarra = Math.min(9, (paso - 4) / 2);

  return (
    <Svg width={ancho} height={alto}>
      <Polyline
        points={`0,${alto} ${ancho},${alto}`}
        stroke={GRIS_LINEA}
        strokeWidth={0.7}
        fill="none"
      />
      {serie.map((m, i) => {
        const centro = i * paso + paso / 2;
        const hColocado = Math.max(1, (m.colocado / max) * (alto - 2));
        const hCobrado = Math.max(1, (m.cobrado / max) * (alto - 2));
        return (
          <G key={m.mes}>
            <Rect
              x={centro - anchoBarra - 1}
              y={alto - hColocado}
              width={anchoBarra}
              height={hColocado}
              fill={VIOLETA}
            />
            <Rect
              x={centro + 1}
              y={alto - hCobrado}
              width={anchoBarra}
              height={hCobrado}
              fill={AZUL}
            />
          </G>
        );
      })}
    </Svg>
  );
}

/** Etiquetas de meses bajo una gráfica — van como texto normal, no SVG. */
function EtiquetasMeses({ serie }: { serie: MesEstado[] }) {
  return (
    <View style={{ flexDirection: "row", marginTop: 2 }}>
      {serie.map((m) => (
        <Text
          key={m.mes}
          style={{
            flex: 1,
            fontSize: 6.5,
            color: TEXTO_SUAVE,
            textAlign: "center",
          }}
        >
          {m.label}
        </Text>
      ))}
    </View>
  );
}

/** Ranking en barras horizontales. */
function Ranking({
  filas,
  color,
  formato,
  vacio,
}: {
  filas: { id: string; label: string; valor: number; detalle: string }[];
  color: string;
  formato: (n: number) => string;
  vacio: string;
}) {
  if (filas.length === 0) {
    return <Text style={{ fontSize: 8, color: TEXTO_SUAVE }}>{vacio}</Text>;
  }
  const max = Math.max(1, ...filas.map((f) => f.valor));

  return (
    <View>
      {filas.map((f, i) => (
        <View key={f.id} style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 8.5, fontWeight: 700 }}>
              {i + 1}. {f.label}
            </Text>
            <Text style={{ fontSize: 8.5, fontWeight: 700 }}>
              {formato(f.valor)}
            </Text>
          </View>
          <View
            style={{
              height: 3.5,
              backgroundColor: "#f0f0f0",
              borderRadius: 2,
              marginTop: 2,
            }}
          >
            <View
              style={{
                height: 3.5,
                width: `${Math.max(3, (f.valor / max) * 100)}%`,
                backgroundColor: color,
                borderRadius: 2,
              }}
            />
          </View>
          <Text style={{ fontSize: 7, color: TEXTO_SUAVE, marginTop: 1.5 }}>
            {f.detalle}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function EstadoResultadosPdf({
  datos,
  nombreApp,
  generadoEn = new Date(),
}: {
  datos: EstadoResultados;
  nombreApp: string;
  generadoEn?: Date;
}) {
  const { cartera, resultado, historico, porTipo, serie, rango } = datos;

  const rebanadasCapital = porTipo
    .filter((t) => t.capitalActivo > 0)
    .map((t) => ({
      label: t.label,
      valor: t.capitalActivo,
      color: COLOR_TIPO[t.tipo] ?? AZUL,
    }));

  const rebanadasEstado = [
    { label: "Al corriente", valor: cartera.alCorriente, color: VERDE },
    { label: "Por vencer", valor: cartera.proximas, color: AMBAR },
    { label: "Vencidas", valor: cartera.vencidas, color: ROJO },
  ].filter((r) => r.valor > 0);

  return (
    <Document>
      {/* ---------------------------- Página 1 ---------------------------- */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.appName}>{nombreApp}</Text>
          <Text style={styles.titulo}>Estado de resultados — {rango.label}</Text>
          <Text style={styles.subtitulo}>
            Generado el{" "}
            {generadoEn.toLocaleString("es-MX", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </Text>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Resumen del negocio</Text>
          {datos.narrativa.map((p, i) => (
            <Text key={i} style={styles.parrafo}>
              {p}
            </Text>
          ))}
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Cartera en la calle (hoy)</Text>
          <View style={styles.grid}>
            <Metrica
              label="Capital activo"
              valor={moneda(cartera.capitalActivo)}
              detalle={`${cartera.contratasActivas} contratas activas`}
              color={AZUL}
            />
            <Metrica
              label="Saldo por cobrar"
              valor={moneda(cartera.saldoPendiente)}
              detalle="Capital + interés pendiente"
            />
            <Metrica
              label="Clientes activos"
              valor={String(cartera.clientesActivos)}
              detalle={`Ticket prom. ${moneda(cartera.ticketPromedio)}`}
            />
            <Metrica
              label="Morosidad"
              valor={`${cartera.morosidad}%`}
              detalle={`${moneda(cartera.saldoEnRiesgo)} en riesgo`}
              color={cartera.morosidad > 20 ? ROJO : undefined}
            />
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>
            Resultado del período — {rango.label}
          </Text>
          <View style={styles.grid}>
            <Metrica
              label="Entregado"
              valor={moneda(resultado.colocado)}
              detalle={`${resultado.numColocadas} contratas nuevas`}
            />
            <Metrica
              label="Cobrado"
              valor={moneda(resultado.cobrado)}
              color={AZUL}
            />
            <Metrica
              label="Ganancia (interés)"
              valor={moneda(resultado.ganancia)}
              detalle={`Margen ${resultado.margen}%`}
              color={VERDE}
            />
            <Metrica
              label="Capital recuperado"
              valor={moneda(resultado.capitalRecuperado)}
              detalle={`Rend. ${resultado.rendimientoSobreCapital}% s/capital`}
            />
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>
            Evolución · últimos {serie.length} meses (cobrado vs. ganancia)
          </Text>
          <GraficaLinea serie={serie} alto={86} />
          <EtiquetasMeses serie={serie} />
          <Leyenda
            items={[
              { label: "Cobrado", color: AZUL },
              { label: "Ganancia", color: VERDE },
            ]}
          />
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>
            Entregado vs. cobrado por mes
          </Text>
          <GraficaBarras serie={serie} alto={66} />
          <EtiquetasMeses serie={serie} />
          <Leyenda
            items={[
              { label: "Entregado", color: VIOLETA },
              { label: "Cobrado", color: AZUL },
            ]}
          />
        </View>

        <Text style={styles.footer} fixed>
          {nombreApp} · Estado de resultados generado el{" "}
          {generadoEn.toLocaleDateString("es-MX", { dateStyle: "long" })} · Los
          montos reflejan la información registrada hasta esa fecha.
        </Text>
      </Page>

      {/* ---------------------------- Página 2 ---------------------------- */}
      <Page size="LETTER" style={styles.page}>
        <View style={[styles.seccion, { flexDirection: "row" }]}>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.seccionTitulo}>Capital por tipo</Text>
            <Dona rebanadas={rebanadasCapital} />
            <Text style={{ fontSize: 9, fontWeight: 700, marginTop: 4 }}>
              {monedaCorta(cartera.capitalActivo)} en la calle
            </Text>
            <Leyenda items={rebanadasCapital} />
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.seccionTitulo}>Estado de la cartera</Text>
            <Dona rebanadas={rebanadasEstado} />
            <Text style={{ fontSize: 9, fontWeight: 700, marginTop: 4 }}>
              {cartera.contratasActivas} contratas activas
            </Text>
            <Leyenda items={rebanadasEstado} />
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>
            Desglose por tipo de contrata
          </Text>
          <View style={styles.tablaHead}>
            <Text style={[styles.th, { width: "16%" }]}>Tipo</Text>
            <Text style={[styles.th, { width: "10%", textAlign: "right" }]}>
              Activas
            </Text>
            <Text style={[styles.th, { width: "18%", textAlign: "right" }]}>
              Capital
            </Text>
            <Text style={[styles.th, { width: "18%", textAlign: "right" }]}>
              Por cobrar
            </Text>
            <Text style={[styles.th, { width: "16%", textAlign: "right" }]}>
              Cobrado
            </Text>
            <Text style={[styles.th, { width: "12%", textAlign: "right" }]}>
              Ganancia
            </Text>
            <Text style={[styles.th, { width: "10%", textAlign: "right" }]}>
              Moros.
            </Text>
          </View>
          {porTipo.map((t) => (
            <View key={t.tipo} style={styles.tablaFila}>
              <View style={{ width: "16%", flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 1,
                    marginRight: 3,
                    backgroundColor: COLOR_TIPO[t.tipo] ?? AZUL,
                  }}
                />
                <Text style={styles.td}>{t.label}</Text>
              </View>
              <Text style={[styles.td, { width: "10%", textAlign: "right" }]}>
                {t.contratasActivas}
              </Text>
              <Text style={[styles.td, { width: "18%", textAlign: "right" }]}>
                {moneda(t.capitalActivo)}
              </Text>
              <Text style={[styles.td, { width: "18%", textAlign: "right" }]}>
                {moneda(t.saldoPendiente)}
              </Text>
              <Text
                style={[
                  styles.td,
                  { width: "16%", textAlign: "right", color: AZUL },
                ]}
              >
                {moneda(t.cobrado)}
              </Text>
              <Text
                style={[
                  styles.td,
                  { width: "12%", textAlign: "right", color: VERDE },
                ]}
              >
                {moneda(t.ganancia)}
              </Text>
              <Text style={[styles.td, { width: "10%", textAlign: "right" }]}>
                {t.contratasActivas === 0 ? "—" : `${t.morosidad}%`}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.seccion, { flexDirection: "row" }]}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.seccionTitulo}>
              Top 5 · clientes con más dinero
            </Text>
            <Ranking
              color={AZUL}
              formato={moneda}
              vacio="Todavía no hay contratas activas."
              filas={datos.topPorMonto.map((c) => ({
                id: c.clienteId,
                label: c.nombre,
                valor: c.capitalActivo,
                detalle: `${c.contratasActivas} ${c.contratasActivas === 1 ? "contrata" : "contratas"} · debe ${moneda(c.saldoPendiente)}`,
              }))}
            />
          </View>
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <Text style={styles.seccionTitulo}>Top 5 · mejor puntualidad</Text>
            <Ranking
              color={VERDE}
              formato={(n) => `${n}%`}
              vacio={`Nadie tiene todavía ${MIN_CUOTAS_PUNTUALIDAD} cuotas pagadas para comparar.`}
              filas={datos.topPorPuntualidad.map((c) => ({
                id: c.clienteId,
                label: c.nombre,
                valor: c.porcentajeATiempo,
                detalle: `${c.cuotasConsideradas} cuotas · ${
                  c.diasPromedioAtraso === 0
                    ? "siempre pagan justo en la fecha"
                    : c.diasPromedioAtraso < 0
                      ? `${Math.abs(c.diasPromedioAtraso)} días de adelanto en promedio`
                      : `${c.diasPromedioAtraso} días de atraso en promedio`
                }`,
              }))}
            />
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Acumulado histórico</Text>
          <View style={styles.grid}>
            <Metrica
              label="Total entregado"
              valor={moneda(historico.colocado)}
              detalle={`${historico.numContratas} contratas`}
            />
            <Metrica
              label="Total cobrado"
              valor={moneda(historico.cobrado)}
              detalle={`Recuperado ${historico.tasaRecuperacion}%`}
              color={AZUL}
            />
            <Metrica
              label="Ganancia histórica"
              valor={moneda(historico.ganancia)}
              color={VERDE}
            />
            <Metrica
              label="Clientes atendidos"
              valor={String(historico.clientesTotales)}
              detalle={`${historico.contratasLiquidadas} liquidadas · ${historico.contratasEnDeuda} en deuda`}
            />
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {nombreApp} · Estado de resultados generado el{" "}
          {generadoEn.toLocaleDateString("es-MX", { dateStyle: "long" })} · Los
          montos reflejan la información registrada hasta esa fecha.
        </Text>
      </Page>
    </Document>
  );
}
