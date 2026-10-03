import { formatDistanceToNowStrict, format } from "date-fns";
import { es } from "date-fns/locale";

export function dinero(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

/** $2.9M / $482K — para KPIs donde no cabe la cifra completa. */
export function dineroCorto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${Math.round(n / 1000)}K`;
  return dinero(n);
}

export function numero(n: number): string {
  return new Intl.NumberFormat("es-MX").format(n);
}

export function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  return `hace ${formatDistanceToNowStrict(new Date(iso), { locale: es })}`;
}

export function hora(iso: string): string {
  return format(new Date(iso), "HH:mm:ss");
}

export function fechaHora(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Etiqueta y clases del badge de origen de un error (colores de Stitch). */
export function origenError(origen: string): { etiqueta: string; clase: string } {
  if (origen === "server") return { etiqueta: "Servidor", clase: "bg-error-container/30 text-error" };
  if (origen === "queue") return { etiqueta: "Cola", clase: "bg-on-primary-container text-primary" };
  return { etiqueta: "Cliente", clase: "bg-tertiary-container/30 text-tertiary" };
}
