"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Saludo } from "@/components/saludo";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getKpis } from "@/lib/offline/repo";
import type { FiltroDashboard } from "@/lib/services/dashboard";
import { formatMoneda, cn } from "@/lib/utils";

const FILTROS: { key: FiltroDashboard; label: string }[] = [
  { key: "TODAS", label: "Todas" },
  { key: "SEMANAL", label: "Semanal" },
  { key: "QUINCENAL", label: "Quincenal" },
  { key: "MENSUAL", label: "Mensual" },
];

export default function DashboardPage() {
  const claims = useAuthClaims();
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

  if (!kpis) return null;

  const entregado = kpis.montoEntregadoMes;
  const nombre = claims.ready ? claims.nombre : null;

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
      <div className="space-y-1">
        <Saludo nombre={nombre} />
        <p className="text-sm text-muted-foreground">Resumen de tu cartera</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
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
              <p className="truncate text-sm font-semibold sm:text-base">
                {formatMoneda(periodo.proyectado)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Cobrado</p>
              <p className="truncate text-sm font-semibold text-primary sm:text-base">
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
              <p className="truncate text-sm font-semibold sm:text-base">
                {formatMoneda(kpis.cobrado.total)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Saldo por cobrar</p>
              <p className="truncate text-sm font-semibold text-primary sm:text-base">
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
            <p className="truncate text-base font-semibold sm:text-lg">
              {formatMoneda(kpis.capitalActivo)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Contratas activas</p>
            <p className="truncate text-base font-semibold sm:text-lg">
              {kpis.contratasActivas}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Dinero entregado este mes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-4 pt-2 sm:grid-cols-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Semanal</p>
            <p className="truncate text-sm font-semibold sm:text-base">
              {formatMoneda(entregado.semanal)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Quincenal</p>
            <p className="truncate text-sm font-semibold sm:text-base">
              {formatMoneda(entregado.quincenal)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Mensual</p>
            <p className="truncate text-sm font-semibold sm:text-base">
              {formatMoneda(entregado.mensual)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Todas</p>
            <p className="truncate text-sm font-semibold text-primary sm:text-base">
              {formatMoneda(entregado.todas)}
            </p>
          </div>
        </CardContent>
      </Card>

      {kpis.contratasActivas === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          No hay contratas activas para este filtro.
        </p>
      )}
    </div>
  );
}
