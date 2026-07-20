import { TrendingUp, CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ResultadoScorePago } from "@/lib/contrata";

const MAP: Record<
  ResultadoScorePago["score"],
  {
    label: string;
    variant: "pagado" | "vencido" | "pendiente" | "secondary";
    Icon: typeof TrendingUp;
  }
> = {
  ADELANTADO: { label: "Paga antes", variant: "pagado", Icon: TrendingUp },
  PUNTUAL: { label: "Puntual", variant: "pagado", Icon: CheckCircle2 },
  MOROSO: { label: "Tarde", variant: "vencido", Icon: AlertTriangle },
  SIN_HISTORIAL: { label: "Sin historial", variant: "secondary", Icon: Minus },
};

/**
 * Puntualidad histórica de pago de un cliente, cruzando todas sus
 * contratas. Pensado para que se vea de un vistazo si conviene volver a
 * prestarle.
 */
export function ScorePagoBadge({
  score,
  className,
}: {
  score: ResultadoScorePago;
  className?: string;
}) {
  const { label, variant, Icon } = MAP[score.score];
  return (
    <Badge variant={variant} className={className}>
      <Icon className="size-3" />
      {label}
      {score.score !== "SIN_HISTORIAL" && ` · ${score.porcentajeATiempo}% a tiempo`}
    </Badge>
  );
}
