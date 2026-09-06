/**
 * Colores de gráficas como strings CSS listos para usar en `fill`,
 * `stroke` o `backgroundColor`.
 *
 * Apuntan a variables CSS (definidas en `globals.css`) en vez de a hex
 * fijos: así una misma gráfica cambia sola entre el tema claro y el oscuro,
 * sin que el componente sepa cuál está activo.
 */
export const CHART = {
  azul: "hsl(var(--chart-1))",
  verde: "hsl(var(--chart-2))",
  violeta: "hsl(var(--chart-3))",
  ambar: "hsl(var(--chart-4))",
  cian: "hsl(var(--chart-5))",
  /** Reusa los colores de estado del dominio, para que "vencido" sea el
   *  mismo rojo aquí que en las listas de contratas. */
  pagado: "hsl(var(--estado-pagado))",
  vencido: "hsl(var(--estado-vencido))",
  pendiente: "hsl(var(--estado-pendiente))",
} as const;

/** Un color por tipo de contrata, estable en todo el reporte. */
export const COLOR_TIPO = {
  SEMANAL: CHART.azul,
  QUINCENAL: CHART.verde,
  MENSUAL: CHART.violeta,
} as const;
