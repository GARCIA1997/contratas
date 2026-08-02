"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { diagnosticarCola, reintentarConflictos } from "@/lib/offline/queue";
import { reportarError } from "@/lib/report-error";

/**
 * Botón de "Revisar y reparar sincronización" para el caso reportado en
 * campo de un elemento que se queda "sin sincronizar" indefinidamente:
 * guarda un snapshot de la cola local en ErrorLog (para diagnosticar la
 * causa real después) e intenta reenviar cualquier operación atorada —
 * "conflict" (un 4xx) o "syncing" (una petición anterior que nunca llegó a
 * resolver, p. ej. la app se cerró a media petición) — ver queue.ts,
 * ninguno de esos dos estados se reintenta solo en un flush normal.
 */
export function DiagnosticoSync({ ownerId }: { ownerId: string }) {
  const [corriendo, setCorriendo] = useState(false);
  const [resumen, setResumen] = useState<string | null>(null);

  async function revisar() {
    setCorriendo(true);
    setResumen(null);
    try {
      const antes = await diagnosticarCola(ownerId);
      reportarError({
        origen: "queue",
        mensaje: "Diagnóstico manual de cola offline (botón en Configuración)",
        contexto: { ownerId, ...antes },
      });

      if (!navigator.onLine) {
        setResumen(
          antes.total === 0
            ? "No hay nada pendiente de sincronizar."
            : `Sin conexión ahora mismo — hay ${antes.total} operación(es) pendiente(s). Se guardó el detalle; vuelve a intentar con señal.`
        );
        return;
      }

      const atoradas = (antes.porEstado.conflict ?? 0) + (antes.porEstado.syncing ?? 0);
      if (atoradas > 0) {
        await reintentarConflictos(ownerId);
      }

      const despues = await diagnosticarCola(ownerId);
      if (despues.total === 0) {
        setResumen("Todo sincronizado — no quedó ninguna operación pendiente.");
      } else {
        const detalle = Object.entries(despues.porEstado)
          .map(([estado, n]) => `${n} ${estado}`)
          .join(", ");
        setResumen(
          `Quedan ${despues.total} operación(es) pendiente(s) (${detalle}). Se guardó el detalle para revisión — repórtalo si sigue igual después de reintentar.`
        );
      }
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs text-muted-foreground">
          Si el indicador de &quot;por sincronizar&quot; no baja aunque haya
          señal, usa esto: revisa qué hay atorado, intenta reenviarlo, y
          guarda el detalle para poder diagnosticarlo después.
        </p>
        <Button
          variant="outline"
          className="w-full"
          disabled={corriendo}
          onClick={revisar}
        >
          <Wrench className="size-4" />
          {corriendo ? "Revisando…" : "Revisar y reparar sincronización"}
        </Button>
        {resumen && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            {resumen.startsWith("Todo") ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-pagado" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-pendiente" />
            )}
            {resumen}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
