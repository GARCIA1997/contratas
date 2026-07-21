import Link from "next/link";
import { ArrowLeft, HandCoins, FilePlus2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TipoContrata } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import type { EventoHistorial } from "@/lib/contrata";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

// `Omit` no distribuye sobre uniones discriminadas por sí solo (colapsa
// EventoHistorial en un solo tipo y se pierde el narrowing por `tipo`) — el
// `extends any ?` fuerza la distribución para que cada variante conserve
// sus propios campos.
type ReplaceFecha<T> = T extends unknown
  ? Omit<T, "fecha"> & { fecha: string }
  : never;
type EventoUI = ReplaceFecha<EventoHistorial>;

function fecha(iso: string) {
  return format(anclarFechaCliente(iso), "d 'de' MMMM yyyy", { locale: es });
}

export function HistorialView({
  clienteId,
  nombre,
  eventos,
}: {
  clienteId: string;
  nombre: string;
  eventos: EventoUI[];
}) {
  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/clientes/${clienteId}`}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Historial completo
        </h1>
        <p className="text-sm text-muted-foreground">{nombre}</p>
      </div>

      {eventos.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Sin actividad registrada todavía.
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-1.5">
          {eventos.map((e, i) => (
            <li key={`${e.tipo}-${e.contrataId}-${e.tipo === "PAGO" ? e.numeroCuota : "inicio"}-${i}`}>
              <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-secondary/30 px-3.5 py-3">
                <div
                  className={
                    e.tipo === "PAGO"
                      ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-pagado/15 text-pagado"
                      : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                  }
                >
                  {e.tipo === "PAGO" ? (
                    <HandCoins className="size-3.5" />
                  ) : (
                    <FilePlus2 className="size-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {e.tipo === "PAGO"
                        ? `Pago recibido — cuota ${e.numeroCuota}`
                        : "Contrata creada"}
                    </p>
                    <span className="shrink-0 text-sm font-semibold">
                      {formatMoneda(e.monto)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TIPO_LABEL[e.contrataTipo]} · {fecha(e.fecha)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
