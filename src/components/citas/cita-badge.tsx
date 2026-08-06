import { Badge } from "@/components/ui/badge";
import type { EstadoCitaVista } from "@/lib/citas";

const MAP: Record<
  EstadoCitaVista,
  { label: string; variant: "pagado" | "vencido" | "pendiente" | "secondary" }
> = {
  PENDIENTE: { label: "Agendada", variant: "pendiente" },
  ATRASADA: { label: "Atrasada", variant: "vencido" },
  ENTREGADA: { label: "Entregada", variant: "pagado" },
  CANCELADA: { label: "Descartada", variant: "secondary" },
};

export function CitaBadge({ estado }: { estado: EstadoCitaVista }) {
  const { label, variant } = MAP[estado];
  return (
    <Badge variant={variant} className="w-[84px] justify-center">
      {label}
    </Badge>
  );
}
