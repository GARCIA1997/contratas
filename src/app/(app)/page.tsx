"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Saludo } from "@/components/saludo";
import { TendenciaChart } from "@/components/tendencia-chart";
import { AccesoEstadoResultadosIcono } from "@/components/estado-resultados/acceso-icono";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getKpis,
  getTendencia,
  getIdsParaPrecarga,
  getCitasPendientes,
} from "@/lib/offline/repo";
import { precargarRutaDelDia } from "@/lib/offline/precarga-ligera";
import { calidadConexion } from "@/lib/offline/conexion";
import type { FiltroDashboard } from "@/lib/services/dashboard";
import { formatMoneda, cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { anclarFechaCliente } from "@/lib/fechas";

const FILTROS: { key: FiltroDashboard; label: string }[] = [
  { key: "TODAS", label: "Todas" },
  { key: "SEMANAL", label: "Semanal" },
  { key: "QUINCENAL", label: "Quincenal" },
  { key: "MENSUAL", label: "Mensual" },
];

export default function DashboardPage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtroParam = searchParams.get("filtro");
  const filtro: FiltroDashboard =
    filtroParam === "SEMANAL"
      ? "SEMANAL"
      : filtroParam === "QUINCENAL"
        ? "QUINCENAL"
        : filtroParam === "MENSUAL"
          ? "MENSUAL"
          : "TODAS";

  const ownerId = claims.ready ? claims.ownerId : null;

  const kpis = useLiveQuery(
    () => (ownerId ? getKpis(ownerId, filtro) : undefined),
    [ownerId, filtro]
  );
  const tendencia = useLiveQuery(
    () => (ownerId ? getTendencia(ownerId) : undefined),
    [ownerId]
  );
  const citasPendientes = useLiveQuery(
    () => (ownerId ? getCitasPendientes(ownerId) : undefined),
    [ownerId]
  );

  // Precarga ligera y automática: solo la ruta del día y las citas, para
  // que perder la señal a media visita no deje una pantalla en negro.
  // Descargar TODA la app es otra cosa —deliberada y bajo demanda— y vive
  // en el botón «Preparar para trabajar sin señal» (preparar-offline.ts).
  useEffect(() => {
    // Solo con señal buena: en 3G la precarga compite con lo que el usuario
    // está tocando ahora mismo, y ahí vale más la pena responder rápido con
    // lo que ya está en caché que adelantar pantallas.
    if (!ownerId || calidadConexion() !== "rapida") return;
    let cancelar: (() => void) | undefined;
    getIdsParaPrecarga(ownerId).then((ids) => {
      cancelar = precargarRutaDelDia(router, ids);
    });
    return () => cancelar?.();
  }, [ownerId, router]);

  if (!kpis) return null;

  const entregado = kpis.montoEntregadoMes;
  const nombre = claims.ready ? claims.nombre : null;
  const esAdmin = claims.ready ? claims.esAdmin : false;
  const totalEstimadoPorEntregar = (citasPendientes ?? []).reduce(
    (s, c) => s + c.montoEstimado,
    0
  );

  // La tarjeta de cobranza se adapta al segmento elegido arriba: cada tipo
  // de contrata tiene su ventana natural (semana/quincena/mes), y en
  // "Todas" usamos el mes como denominador común.
  const periodo =
    filtro === "SEMANAL"
      ? {
          label: "esta semana",
          proyectado: kpis.proyectado.semana,
          cobrado: kpis.cobrado.semana,
        }
      : filtro === "QUINCENAL"
        ? {
            label: "esta quincena",
            proyectado: kpis.proyectado.quincena,
            cobrado: kpis.cobrado.quincena,
          }
        : {
            label: "este mes",
            proyectado: kpis.proyectado.mes,
            cobrado: kpis.cobrado.mes,
          };
  const porcentajeCobrado =
    periodo.proyectado > 0
      ? Math.min(100, Math.round((periodo.cobrado / periodo.proyectado) * 100))
      : periodo.cobrado > 0
        ? 100
        : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Saludo nombre={nombre} />
          <p className="text-sm text-muted-foreground">Resumen de tu cartera</p>
        </div>
        {esAdmin && <AccesoEstadoResultadosIcono />}
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1 md:max-w-sm">
        {FILTROS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "TODAS" ? "/" : `/?filtro=${f.key}`}
            className={cn(
              "flex-1 rounded-md py-1.5 text-center text-xs font-medium transition-colors sm:text-sm",
              filtro === f.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/*
        En móvil (sin prefijo) esto sigue siendo un simple stack vertical
        (space-y-4 heredado del contenedor de arriba, grid desactivado). A
        partir de md: se activa un grid de 2/3 columnas — las tarjetas de
        resumen ocupan una celda, las que tienen datos más anchos (flujo de
        caja, tendencia, dinero entregado) ocupan la fila completa.
      */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Cobranza · <span className="capitalize">{periodo.label}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Proyectado</p>
              <p className="truncate text-sm font-semibold sm:text-base md:text-sm lg:text-base">
                {formatMoneda(periodo.proyectado)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Cobrado</p>
              <p className="truncate text-sm font-semibold text-primary sm:text-base md:text-sm lg:text-base">
                {formatMoneda(periodo.cobrado)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${porcentajeCobrado}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {porcentajeCobrado}% de lo proyectado {periodo.label}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Cobrado histórico
              </p>
              <p className="truncate text-sm font-semibold sm:text-base md:text-sm lg:text-base">
                {formatMoneda(kpis.cobrado.total)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Saldo por cobrar</p>
              <p className="truncate text-sm font-semibold text-primary sm:text-base md:text-sm lg:text-base">
                {formatMoneda(kpis.saldoPendiente)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Cartera activa
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-4 pt-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Capital activo</p>
            <p className="truncate text-base font-semibold sm:text-lg md:text-base lg:text-lg">
              {formatMoneda(kpis.capitalActivo)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Contratas activas</p>
            <p className="truncate text-base font-semibold sm:text-lg md:text-base lg:text-lg">
              {kpis.contratasActivas}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Por entregar
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-4 pt-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Citas agendadas</p>
            <p className="truncate text-base font-semibold sm:text-lg md:text-base lg:text-lg">
              {citasPendientes?.length ?? 0}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Estimado total</p>
            <p className="truncate text-base font-semibold text-primary sm:text-lg md:text-base lg:text-lg">
              {formatMoneda(totalEstimadoPorEntregar)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Salud de la cartera
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 p-4 pt-2 md:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Morosidad</p>
            <p
              className={cn(
                "truncate text-base font-semibold sm:text-lg md:text-base lg:text-lg",
                kpis.tasaMorosidad === 0
                  ? "text-pagado"
                  : kpis.tasaMorosidad > 20
                    ? "text-vencido"
                    : "text-pendiente"
              )}
            >
              {kpis.tasaMorosidad}%
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Ganancia este mes</p>
            <p className="truncate text-base font-semibold text-primary sm:text-lg md:text-base lg:text-lg">
              {formatMoneda(kpis.ganancia.mes)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Atraso promedio</p>
            <p className="truncate text-base font-semibold sm:text-lg md:text-base lg:text-lg">
              {kpis.diasPromedioAtraso === null
                ? "—"
                : `${kpis.diasPromedioAtraso} d`}
            </p>
          </div>
        </CardContent>
        <CardContent className="flex items-center justify-between border-t p-4 pt-3 text-xs text-muted-foreground">
          <span>Ganancia histórica (interés cobrado)</span>
          <span className="font-semibold text-foreground">
            {formatMoneda(kpis.ganancia.total)}
          </span>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Flujo de caja proyectado
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-4 gap-2 p-4 pt-2">
          {kpis.flujoProyectado.map((b, i) => (
            <div key={b.desde} className="min-w-0 text-center">
              <p className="text-[10px] font-medium text-muted-foreground">
                {i === 0 ? "Esta semana" : `Semana ${i + 1}`}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {format(anclarFechaCliente(b.desde), "d MMM", { locale: es })}
                {" – "}
                {format(anclarFechaCliente(b.hasta), "d MMM", { locale: es })}
              </p>
              <p className="truncate text-sm font-semibold sm:text-base md:text-sm lg:text-base">
                {formatMoneda(b.monto)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {tendencia && tendencia.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Tendencia · últimos 6 meses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <TendenciaChart meses={tendencia} />
          </CardContent>
        </Card>
      )}

      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Dinero entregado este mes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-4 pt-2 sm:grid-cols-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Semanal</p>
            <p className="truncate text-sm font-semibold sm:text-base md:text-sm lg:text-base">
              {formatMoneda(entregado.semanal)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Quincenal</p>
            <p className="truncate text-sm font-semibold sm:text-base md:text-sm lg:text-base">
              {formatMoneda(entregado.quincenal)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mensual</p>
            <p className="truncate text-sm font-semibold sm:text-base md:text-sm lg:text-base">
              {formatMoneda(entregado.mensual)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Todas</p>
            <p className="truncate text-sm font-semibold text-primary sm:text-base md:text-sm lg:text-base">
              {formatMoneda(entregado.todas)}
            </p>
          </div>
        </CardContent>
      </Card>
      </div>

      {kpis.contratasActivas === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          No hay contratas activas para este filtro.
        </p>
      )}
    </div>
  );
}
