"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileBarChart } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { OfflineAwareLink } from "@/components/offline/offline-aware-link";
import { ReporteEstadoResultados } from "@/components/estado-resultados/reporte";
import { DescargarEstadoResultadosPdf } from "@/components/estado-resultados/descargar-pdf-boton";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getEstadoResultados } from "@/lib/offline/repo";
import type { PeriodoEstado } from "@/lib/services/estado-resultados";

const PERIODOS: { value: PeriodoEstado; label: string }[] = [
  { value: "MES", label: "Mes" },
  { value: "TRIMESTRE", label: "3 meses" },
  { value: "ANIO", label: "Año" },
  { value: "HISTORICO", label: "Todo" },
];

/**
 * Estado de resultados completo. Se calcula en el navegador sobre los datos
 * ya sincronizados en IndexedDB (`getEstadoResultados`), así que abre igual
 * de rápido con o sin señal y cambiar de período no cuesta un round-trip.
 */
export default function EstadoResultadosPage() {
  const claims = useAuthClaims();
  const [periodo, setPeriodo] = useState<PeriodoEstado>("MES");

  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready ? claims.esAdmin : false;

  const datos = useLiveQuery(
    () => (ownerId && esAdmin ? getEstadoResultados(ownerId, periodo) : undefined),
    [ownerId, esAdmin, periodo]
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">
          <ArrowLeft className="size-4" /> Inicio
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Estado de resultados
        </h1>
        <p className="text-sm text-muted-foreground">
          Cómo va el negocio: qué hay en la calle, qué entró y de dónde viene
          la ganancia.
        </p>
      </div>

      {claims.ready && !esAdmin ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Solo un usuario ADMIN puede ver el estado de resultados.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SegmentedControl
              value={periodo}
              onChange={setPeriodo}
              options={PERIODOS}
              className="sm:max-w-sm sm:flex-1"
            />
            {/* Descarga el mismo período que se está viendo en pantalla. */}
            <DescargarEstadoResultadosPdf periodo={periodo}>
              Descargar PDF
            </DescargarEstadoResultadosPdf>
          </div>

          {!datos ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Calculando…
              </CardContent>
            </Card>
          ) : (
            <ReporteEstadoResultados datos={datos} />
          )}

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Cortes de caja mensuales</p>
                <p className="text-xs text-muted-foreground">
                  El cierre guardado de cada mes, con su PDF para imprimir.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <OfflineAwareLink href="/config/corte-caja">
                  <FileBarChart className="size-4" /> Ver cortes
                </OfflineAwareLink>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
