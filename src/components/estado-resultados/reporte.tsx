"use client";

import {
  Banknote,
  CalendarClock,
  Coins,
  FileBarChart,
  PiggyBank,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DonaChart, LeyendaDona } from "@/components/charts/dona-chart";
import { LineaChart } from "@/components/charts/linea-chart";
import {
  BarrasChart,
  BarrasHorizontales,
} from "@/components/charts/barras-chart";
import { CHART, COLOR_TIPO } from "@/components/charts/colores";
import { cn } from "@/lib/utils";
import type { EstadoResultados } from "@/lib/services/estado-resultados";
import { MIN_CUOTAS_PUNTUALIDAD } from "@/lib/services/estado-resultados";

/**
 * Moneda sin centavos. En un reporte de cartera los centavos son ruido: lo
 * que importa es el orden de magnitud, y con 20+ cifras en pantalla los
 * ".00" quitan más de lo que aportan (el detalle exacto vive en el estado de
 * cuenta de cada cliente).
 */
function moneda(n: number): string {
  return `$${Math.round(n).toLocaleString("es-MX")}`;
}

/**
 * Traduce el promedio de días de atraso a algo que se lea natural. El caso
 * exacto de cero es el que importa: "0 días de adelanto" suena a error de
 * cálculo, cuando en realidad es el mejor resultado posible.
 */
function puntualidadEnPalabras(diasPromedioAtraso: number): string {
  if (diasPromedioAtraso === 0) return "siempre pagan justo en la fecha";
  if (diasPromedioAtraso < 0) {
    const dias = Math.abs(diasPromedioAtraso);
    return `${dias} ${dias === 1 ? "día" : "días"} de adelanto en promedio`;
  }
  return `${diasPromedioAtraso} ${diasPromedioAtraso === 1 ? "día" : "días"} de atraso en promedio`;
}

/** Versión corta para ejes de gráficas: $12.5k, $1.2M. */
function monedaCorta(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function Metrica({
  icono: Icono,
  label,
  valor,
  detalle,
  tono = "normal",
}: {
  icono: typeof Wallet;
  label: string;
  valor: string;
  detalle?: string;
  tono?: "normal" | "primario" | "bueno" | "alerta";
}) {
  return (
    <div className="min-w-0 space-y-1 rounded-xl border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icono className="size-3.5 shrink-0" />
        <p className="truncate text-[11px] font-medium">{label}</p>
      </div>
      <p
        className={cn(
          "truncate text-lg font-bold leading-tight tabular-nums",
          tono === "primario" && "text-primary",
          tono === "bueno" && "text-pagado",
          tono === "alerta" && "text-vencido"
        )}
      >
        {valor}
      </p>
      {detalle && (
        <p className="truncate text-[10px] text-muted-foreground">{detalle}</p>
      )}
    </div>
  );
}

function SeccionTitulo({
  icono: Icono,
  children,
  sufijo,
}: {
  icono: typeof Wallet;
  children: React.ReactNode;
  sufijo?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
        <Icono className="size-4 text-primary" />
        {children}
      </CardTitle>
      {sufijo}
    </CardHeader>
  );
}

export function ReporteEstadoResultados({ datos }: { datos: EstadoResultados }) {
  const { cartera, resultado, historico, porTipo, serie, rango } = datos;

  const rebanadasCapital = porTipo
    .filter((t) => t.capitalActivo > 0)
    .map((t) => ({
      label: t.label,
      valor: t.capitalActivo,
      color: COLOR_TIPO[t.tipo],
    }));

  const rebanadasEstado = [
    { label: "Al corriente", valor: cartera.alCorriente, color: CHART.pagado },
    { label: "Por vencer", valor: cartera.proximas, color: CHART.ambar },
    { label: "Vencidas", valor: cartera.vencidas, color: CHART.vencido },
  ].filter((r) => r.valor > 0);

  const etiquetasMeses = serie.map((m) => m.label);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------
          Resumen en prosa: lo primero que se ve, porque responde "¿cómo
          voy?" sin obligar a interpretar una sola gráfica.
         --------------------------------------------------------------- */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <SeccionTitulo icono={Sparkles}>Resumen del negocio</SeccionTitulo>
        <CardContent className="space-y-2 p-4 pt-0">
          {datos.narrativa.map((p, i) => (
            <p
              key={i}
              className={cn(
                "text-sm leading-relaxed",
                i === 0 ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {p}
            </p>
          ))}
        </CardContent>
      </Card>

      {/* --- Cartera hoy --- */}
      <Card>
        <SeccionTitulo
          icono={Wallet}
          sufijo={
            <Badge variant="secondary" className="shrink-0">
              Hoy
            </Badge>
          }
        >
          Cartera en la calle
        </SeccionTitulo>
        <CardContent className="grid grid-cols-2 gap-2 p-4 pt-0 sm:grid-cols-3 lg:grid-cols-4">
          <Metrica
            icono={Banknote}
            label="Capital activo"
            valor={moneda(cartera.capitalActivo)}
            detalle={`${cartera.contratasActivas} contratas activas`}
            tono="primario"
          />
          <Metrica
            icono={Coins}
            label="Saldo por cobrar"
            valor={moneda(cartera.saldoPendiente)}
            detalle="Capital + interés pendiente"
          />
          <Metrica
            icono={Users}
            label="Clientes activos"
            valor={String(cartera.clientesActivos)}
            detalle={`Ticket prom. ${moneda(cartera.ticketPromedio)}`}
          />
          <Metrica
            icono={ShieldAlert}
            label="Morosidad"
            valor={`${cartera.morosidad}%`}
            detalle={`${moneda(cartera.saldoEnRiesgo)} en riesgo`}
            tono={
              cartera.morosidad === 0
                ? "bueno"
                : cartera.morosidad > 20
                  ? "alerta"
                  : "normal"
            }
          />
        </CardContent>
      </Card>

      {/* --- Resultado del período --- */}
      <Card>
        <SeccionTitulo
          icono={TrendingUp}
          sufijo={
            <Badge variant="secondary" className="shrink-0 capitalize">
              {rango.label}
            </Badge>
          }
        >
          Resultado del período
        </SeccionTitulo>
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metrica
              icono={PiggyBank}
              label="Entregado"
              valor={moneda(resultado.colocado)}
              detalle={`${resultado.numColocadas} contratas nuevas`}
            />
            <Metrica
              icono={Banknote}
              label="Cobrado"
              valor={moneda(resultado.cobrado)}
              tono="primario"
            />
            <Metrica
              icono={TrendingUp}
              label="Ganancia"
              valor={moneda(resultado.ganancia)}
              detalle={`Margen ${resultado.margen}%`}
              tono="bueno"
            />
            <Metrica
              icono={Coins}
              label="Capital recuperado"
              valor={moneda(resultado.capitalRecuperado)}
              detalle={`Rend. ${resultado.rendimientoSobreCapital}% s/capital`}
            />
          </div>

          {resultado.cobrado > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Composición de lo cobrado
              </p>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full"
                  style={{
                    width: `${100 - resultado.margen}%`,
                    backgroundColor: CHART.azul,
                  }}
                  title={`Capital recuperado ${moneda(resultado.capitalRecuperado)}`}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${resultado.margen}%`,
                    backgroundColor: CHART.verde,
                  }}
                  title={`Ganancia ${moneda(resultado.ganancia)}`}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-sm"
                    style={{ backgroundColor: CHART.azul }}
                  />
                  Capital que regresó · {moneda(resultado.capitalRecuperado)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-sm"
                    style={{ backgroundColor: CHART.verde }}
                  />
                  Ganancia · {moneda(resultado.ganancia)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Evolución mensual (línea) --- */}
      <Card>
        <SeccionTitulo icono={CalendarClock}>
          Evolución · últimos {serie.length} meses
        </SeccionTitulo>
        <CardContent className="p-4 pt-0">
          <LineaChart
            etiquetas={etiquetasMeses}
            formato={monedaCorta}
            series={[
              {
                label: "Cobrado",
                color: CHART.azul,
                valores: serie.map((m) => m.cobrado),
                area: true,
              },
              {
                label: "Ganancia",
                color: CHART.verde,
                valores: serie.map((m) => m.ganancia),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* --- Colocado vs cobrado (barras) --- */}
      <Card>
        <SeccionTitulo icono={FileBarChart}>
          Entregado vs. cobrado por mes
        </SeccionTitulo>
        <CardContent className="p-4 pt-0">
          <BarrasChart
            etiquetas={etiquetasMeses}
            formato={monedaCorta}
            series={[
              {
                label: "Entregado",
                color: CHART.violeta,
                valores: serie.map((m) => m.colocado),
              },
              {
                label: "Cobrado",
                color: CHART.azul,
                valores: serie.map((m) => m.cobrado),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* --- Donas: capital por tipo y estado de la cartera --- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SeccionTitulo icono={PiggyBank}>Capital por tipo</SeccionTitulo>
          <CardContent className="flex flex-col items-center gap-4 p-4 pt-0 sm:flex-row">
            <DonaChart
              rebanadas={rebanadasCapital}
              centroValor={monedaCorta(cartera.capitalActivo)}
              centroLabel="en la calle"
            />
            {rebanadasCapital.length > 0 ? (
              <LeyendaDona rebanadas={rebanadasCapital} formato={moneda} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin capital activo por graficar.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <SeccionTitulo icono={ShieldAlert}>Estado de la cartera</SeccionTitulo>
          <CardContent className="flex flex-col items-center gap-4 p-4 pt-0 sm:flex-row">
            <DonaChart
              rebanadas={rebanadasEstado}
              centroValor={String(cartera.contratasActivas)}
              centroLabel="contratas activas"
            />
            {rebanadasEstado.length > 0 ? (
              <LeyendaDona
                rebanadas={rebanadasEstado}
                formato={(n) => `${n}`}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No hay contratas activas.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Tabla por tipo de contrata --- */}
      <Card>
        <SeccionTitulo icono={FileBarChart}>
          Desglose por tipo de contrata
        </SeccionTitulo>
        <CardContent className="p-4 pt-0">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-1 py-2 font-medium">Tipo</th>
                  <th className="px-1 py-2 text-right font-medium">Activas</th>
                  <th className="px-1 py-2 text-right font-medium">Capital</th>
                  <th className="px-1 py-2 text-right font-medium">Por cobrar</th>
                  <th className="px-1 py-2 text-right font-medium">
                    Cobrado <span className="font-normal">({rango.label.toLowerCase()})</span>
                  </th>
                  <th className="px-1 py-2 text-right font-medium">Ganancia</th>
                  <th className="px-1 py-2 text-right font-medium">Morosidad</th>
                </tr>
              </thead>
              <tbody>
                {porTipo.map((t) => (
                  <tr key={t.tipo} className="border-b last:border-0">
                    <td className="px-1 py-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span
                          className="size-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: COLOR_TIPO[t.tipo] }}
                        />
                        {t.label}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {t.contratasActivas}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {moneda(t.capitalActivo)}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {moneda(t.saldoPendiente)}
                    </td>
                    <td className="px-1 py-2 text-right font-medium tabular-nums text-primary">
                      {moneda(t.cobrado)}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums text-pagado">
                      {moneda(t.ganancia)}
                    </td>
                    <td
                      className={cn(
                        "px-1 py-2 text-right tabular-nums",
                        t.morosidad > 20 && "text-vencido"
                      )}
                    >
                      {t.contratasActivas === 0 ? "—" : `${t.morosidad}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* --- Rankings de clientes --- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SeccionTitulo icono={Banknote}>
            Top 5 · clientes con más dinero
          </SeccionTitulo>
          <CardContent className="p-4 pt-0">
            <BarrasHorizontales
              color={CHART.azul}
              formato={moneda}
              vacio="Todavía no hay contratas activas."
              filas={datos.topPorMonto.map((c) => ({
                id: c.clienteId,
                label: c.nombre,
                valor: c.capitalActivo,
                detalle: `${c.contratasActivas} ${c.contratasActivas === 1 ? "contrata" : "contratas"} · debe ${moneda(c.saldoPendiente)}`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <SeccionTitulo icono={TrendingUp}>
            Top 5 · mejor puntualidad
          </SeccionTitulo>
          <CardContent className="space-y-2 p-4 pt-0">
            <BarrasHorizontales
              color={CHART.verde}
              formato={(n) => `${n}%`}
              vacio={`Nadie tiene todavía ${MIN_CUOTAS_PUNTUALIDAD} cuotas pagadas para comparar.`}
              filas={datos.topPorPuntualidad.map((c) => ({
                id: c.clienteId,
                label: c.nombre,
                valor: c.porcentajeATiempo,
                detalle: `${c.cuotasConsideradas} cuotas · ${puntualidadEnPalabras(c.diasPromedioAtraso)}`,
              }))}
            />
            {datos.topPorPuntualidad.length > 0 && (
              <p className="pt-1 text-[10px] text-muted-foreground">
                Solo entran clientes con {MIN_CUOTAS_PUNTUALIDAD} cuotas pagadas
                o más — con una o dos, cualquiera sale al 100%.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Acumulado histórico --- */}
      <Card>
        <SeccionTitulo icono={Coins}>Acumulado histórico</SeccionTitulo>
        <CardContent className="grid grid-cols-2 gap-2 p-4 pt-0 sm:grid-cols-3 lg:grid-cols-4">
          <Metrica
            icono={PiggyBank}
            label="Total entregado"
            valor={moneda(historico.colocado)}
            detalle={`${historico.numContratas} contratas`}
          />
          <Metrica
            icono={Banknote}
            label="Total cobrado"
            valor={moneda(historico.cobrado)}
            detalle={`Recuperado ${historico.tasaRecuperacion}%`}
            tono="primario"
          />
          <Metrica
            icono={TrendingUp}
            label="Ganancia histórica"
            valor={moneda(historico.ganancia)}
            tono="bueno"
          />
          <Metrica
            icono={Users}
            label="Clientes atendidos"
            valor={String(historico.clientesTotales)}
            detalle={`${historico.contratasLiquidadas} liquidadas · ${historico.contratasEnDeuda} en deuda`}
          />
        </CardContent>
        {cartera.diasPromedioAtraso !== null && (
          <CardContent className="flex items-center justify-between border-t p-4 text-xs text-muted-foreground">
            <span>Atraso promedio cuando pagan tarde</span>
            <span className="font-semibold text-foreground">
              {cartera.diasPromedioAtraso === 0
                ? "Sin atrasos"
                : `${cartera.diasPromedioAtraso} días`}
            </span>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
