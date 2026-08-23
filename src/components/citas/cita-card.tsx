"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CitaBadge } from "@/components/citas/cita-badge";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { estadoCitaVista } from "@/lib/citas";
import { enqueue } from "@/lib/offline/queue";
import { syncCitas } from "@/lib/offline/sync";
import type { CitaLocal } from "@/lib/offline/db";
import {
  fetchConTimeout,
  TIMEOUT_ESCRITURA_MS,
} from "@/lib/offline/conexion";

const TIPO_LABEL: Record<CitaLocal["tipo"], string> = {
  NUEVA: "Nueva contrata",
  RENOVACION: "Renovación",
  SIN_DEFINIR: "Sin definir",
};

export function CitaCard({
  cita,
  ownerId,
}: {
  cita: CitaLocal;
  ownerId: string;
}) {
  const [descartando, setDescartando] = useState(false);
  const estado = estadoCitaVista(cita);
  const necesitaOrigen = cita.tipo === "RENOVACION" && !cita.contrataOrigenId;
  const contrataOrigenUtil = cita.tipo !== "NUEVA" ? cita.contrataOrigenId : null;
  const convertirHref = necesitaOrigen
    ? `/citas/${cita.id}/editar`
    : contrataOrigenUtil
      ? `/contratas/${contrataOrigenUtil}/renovar?citaId=${cita.id}`
      : `/contratas/nueva?clienteId=${cita.clienteId}&citaId=${cita.id}`;

  async function descartar() {
    if (!confirm(`¿Descartar la cita de ${cita.clienteNombre}?`)) return;
    setDescartando(true);
    const sinConexion = typeof navigator !== "undefined" && !navigator.onLine;
    if (sinConexion) {
      await enqueue(ownerId, "cita.cancelar", { citaId: cita.id });
    } else {
      try {
        await fetchConTimeout(
          `/api/citas/${cita.id}/cancelar`,
          { method: "POST" },
          TIMEOUT_ESCRITURA_MS
        );
        await syncCitas(ownerId);
      } catch {
        // Si la red falló, se encola para que no se pierda la intención.
        // Cancelar dos veces deja el mismo estado, así que reintentar es
        // seguro aunque la petición sí hubiera llegado.
        await enqueue(ownerId, "cita.cancelar", { citaId: cita.id });
      }
    }
    setDescartando(false);
  }

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/clientes/${cita.clienteId}`}
              className="text-sm font-semibold hover:underline"
            >
              {cita.clienteNombre}
            </Link>
            <p className="text-xs text-muted-foreground">
              {TIPO_LABEL[cita.tipo]} ·{" "}
              {format(anclarFechaCliente(cita.fechaEntrega), "d MMM", {
                locale: es,
              })}
            </p>
          </div>
          <CitaBadge estado={estado} />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Estimado</p>
          <p className="text-lg font-bold text-primary">
            {formatMoneda(cita.montoEstimado)}
          </p>
        </div>

        {cita.notas && (
          <p className="text-xs text-muted-foreground">{cita.notas}</p>
        )}

        {cita.estado === "PENDIENTE" && (
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/citas/${cita.id}/editar`}>
                <Pencil className="size-4" /> Reagendar
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={descartando}
              onClick={descartar}
            >
              <X className="size-4" /> Descartar
            </Button>
            <Button size="sm" asChild>
              <Link href={convertirHref}>
                <ArrowRight className="size-4" />{" "}
                {necesitaOrigen ? "Elegir contrata" : "Convertir"}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
