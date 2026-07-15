import { Badge } from "@/components/ui/badge";
import type { EstadoContrata } from "@/lib/contrata";

const MAP: Record<
  EstadoContrata,
  { label: string; variant: "pagado" | "vencido" | "pendiente" | "secondary" }
> = {
  AL_CORRIENTE: { label: "Al día", variant: "pagado" },
  PROXIMO: { label: "Próximo", variant: "pendiente" },
  VENCIDO: { label: "Vencido", variant: "vencido" },
  LIQUIDADA: { label: "Pagada", variant: "secondary" },
  EN_DEUDA: { label: "En deuda", variant: "pendiente" },
};

export function EstadoBadge({ estado }: { estado: EstadoContrata }) {
  const { label, variant } = MAP[estado];
  return (
    <Badge variant={variant} className="w-[76px] justify-center">
      {label}
    </Badge>
  );
}
