"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Combine,
  FileText,
  History,
  Pencil,
  Plus,
  ArrowLeft,
  CalendarPlus,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EliminarCliente } from "@/components/clientes/eliminar-cliente";
import { HistorialContratas } from "@/components/clientes/historial-contratas";
import { CobroVencido } from "@/components/clientes/cobro-vencido";
import { AbonarModal } from "@/components/clientes/abonar-modal";
import { ScorePagoBadge } from "@/components/score-pago-badge";
import { CitaCard } from "@/components/citas/cita-card";
import { cn, formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getClientePerfil,
  getCobroVencidoPreview,
  getCitasDeCliente,
} from "@/lib/offline/repo";

type ExtrasOnline = {
  cobroPreview: { total: number; items: unknown[] } | null;
  nombreApp: string | null;
};

/**
 * "Cobro vencido" requiere datos que no viven en la caché offline (Fase B
 * no lo cubre) — se pide aparte, solo cuando hay red, y se oculta si la
 * petición falla (sin conexión, por ejemplo).
 */
function useExtrasOnline(clienteId: string, esAdmin: boolean): ExtrasOnline {
  const [extras, setExtras] = useState<ExtrasOnline>({
    cobroPreview: null,
    nombreApp: null,
  });

  useEffect(() => {
    if (!esAdmin) return;
    let cancelado = false;
    (async () => {
      try {
        const [cobroRes, configRes] = await Promise.all([
          fetch(`/api/clientes/${clienteId}/cobrar-vencidas`),
          fetch("/api/configuracion"),
        ]);
        if (cancelado) return;
        const cobroPreview = cobroRes.ok ? await cobroRes.json() : null;
        const config = configRes.ok ? await configRes.json() : null;
        setExtras({ cobroPreview, nombreApp: config?.nombreApp ?? null });
      } catch {
        // Sin red: el widget simplemente no aparece.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clienteId, esAdmin]);

  return extras;
}

export default function ClientePerfilPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready ? claims.esAdmin : false;

  const perfil = useLiveQuery(
    () => (ownerId ? getClientePerfil(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const citasPendientes = useLiveQuery(
    () => (ownerId ? getCitasDeCliente(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );

  // Igual que en ContrataDetalle: adelanta el prefetch de las pantallas de
  // solo lectura del perfil para que sigan funcionando si se pierde la
  // conexión justo después de abrirlo.
  useEffect(() => {
    router.prefetch(`/clientes/${params.id}/historial`);
    router.prefetch(`/clientes/${params.id}/estado-cuenta`);
    const elegibles = perfil?.contratas.filter(
      (c) => c.estado !== "LIQUIDADA" && c.estado !== "EN_DEUDA" && c.saldo > 0
    ).length;
    if (elegibles !== undefined && elegibles >= 2) {
      router.prefetch(`/clientes/${params.id}/unificar`);
    }
  }, [router, params.id, perfil]);

  const extras = useExtrasOnline(params.id, esAdmin);
  // Respaldo offline: si no se pudo pedir el preview real al servidor
  // (sin red), se calcula localmente sobre los datos ya sincronizados.
  const previewLocal = useLiveQuery(
    () =>
      !extras.cobroPreview && ownerId
        ? getCobroVencidoPreview(ownerId, params.id)
        : undefined,
    [extras.cobroPreview, ownerId, params.id]
  );

  if (perfil === undefined) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  if (perfil === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cliente no encontrado.
      </p>
    );
  }

  const { totales } = perfil;
  // Si hay algo por cobrar, "Cobrar pendiente" y "Abonar" van a dos
  // columnas; si no, "Abonar" se queda solo y ocupa el renglón completo.
  //
  // Se compara contra el TOTAL, no contra la presencia del preview: la API
  // responde `{total: 0, items: []}` cuando no hay nada vencido, y ese
  // objeto es truthy — dejaba a "Abonar" a media fila con la otra columna
  // vacía. Es la misma condición con la que CobroVencido decide si se
  // dibuja (devuelve null con total <= 0).
  const hayCobroPendiente =
    (extras.cobroPreview?.total ?? 0) > 0 || (previewLocal?.total ?? 0) > 0;
  const elegiblesUnificar = perfil.contratas.filter(
    (c) => c.estado !== "LIQUIDADA" && c.estado !== "EN_DEUDA" && c.saldo > 0
  ).length;

  return (
    <div className="space-y-4 md:max-w-xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clientes">
            <ArrowLeft className="size-4" /> Clientes
          </Link>
        </Button>
        {esAdmin && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/clientes/${perfil.id}/editar`}>
                <Pencil className="size-4" /> Editar
              </Link>
            </Button>
            <EliminarCliente
              id={perfil.id}
              deshabilitado={perfil.contratas.length > 0}
            />
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{perfil.nombre}</h1>
          <ScorePagoBadge score={perfil.scorePago} />
        </div>
        {perfil.telefono && (
          <p className="text-sm text-muted-foreground">{perfil.telefono}</p>
        )}
        {perfil.direccion && (
          <p className="text-sm text-muted-foreground">{perfil.direccion}</p>
        )}
        {perfil.referencia && (
          <p className="text-sm text-muted-foreground">
            Referencia: {perfil.referencia}
          </p>
        )}
        {perfil.notas && (
          <p className="text-sm text-muted-foreground">{perfil.notas}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Capital prestado</p>
            <p className="text-lg font-bold">
              {formatMoneda(totales.capitalPrestado)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
            <p className="text-lg font-bold text-primary">
              {formatMoneda(totales.saldoPendiente)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Activas</p>
            <p className="text-lg font-bold">{totales.contratasActivas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Liquidadas</p>
            <p className="text-lg font-bold">{totales.contratasLiquidadas}</p>
          </CardContent>
        </Card>
      </div>

      {/*
        "Cobrar pendiente" y "Abonar" comparten renglón. Grid y no flex: con
        `flex-1 basis-0` los dos botones salían de anchos distintos (147 vs
        189px medidos en el navegador), mientras que dos columnas de grid
        quedan idénticas por definición.

        Las columnas se ajustan al contenido real: si no hay nada vencido,
        CobroVencido devuelve null y "Abonar" toma el ancho completo en vez
        de quedar como media fila huérfana. Y el recibo que aparece después
        de cobrar ocupa las dos columnas (ver `enFila`).
      */}
      {esAdmin && (
        <div
          className={cn(
            "grid gap-2",
            hayCobroPendiente ? "grid-cols-2" : "grid-cols-1"
          )}
        >
          {extras.cobroPreview && extras.nombreApp && (
            <CobroVencido
              clienteId={perfil.id}
              nombreApp={extras.nombreApp}
              totalInicial={extras.cobroPreview.total}
              cuotasInicial={extras.cobroPreview.items.length}
              ownerId={ownerId}
              enFila
            />
          )}

          {!extras.cobroPreview && previewLocal && previewLocal.total > 0 && (
            <CobroVencido
              clienteId={perfil.id}
              nombreApp="Kredired"
              totalInicial={previewLocal.total}
              cuotasInicial={previewLocal.items}
              ownerId={ownerId}
              enFila
            />
          )}

          {ownerId && (
            <AbonarModal
              clienteId={perfil.id}
              ownerId={ownerId}
              nombreApp={extras.nombreApp ?? "Kredired"}
              clienteNombre={perfil.nombre}
              telefono={perfil.telefono}
              className="h-auto"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" asChild>
          <Link href={`/clientes/${perfil.id}/estado-cuenta`}>
            <FileText className="size-4" /> Estado de cuenta
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/clientes/${perfil.id}/historial`}>
            <History className="size-4" /> Historial
          </Link>
        </Button>
      </div>

      {esAdmin && (
        <div
          className={cn(
            "grid gap-2",
            elegiblesUnificar >= 2 ? "grid-cols-3" : "grid-cols-2"
          )}
        >
          <Button variant="outline" asChild>
            <Link href={`/contratas/nueva?clienteId=${perfil.id}`}>
              <Plus className="size-4" /> Nueva
            </Link>
          </Button>
          {elegiblesUnificar >= 2 && (
            <Button variant="outline" asChild>
              <Link href={`/clientes/${perfil.id}/unificar`}>
                <Combine className="size-4" /> Unificar
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={`/citas/nueva?clienteId=${perfil.id}`}>
              <CalendarPlus className="size-4" /> Agendar
            </Link>
          </Button>
        </div>
      )}

      {citasPendientes && citasPendientes.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Próximas citas
          </h2>
          <div className="space-y-2">
            {citasPendientes.map((c) => (
              <CitaCard key={c.id} cita={c} ownerId={ownerId as string} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Historial de contratas
        </h2>
        <HistorialContratas contratas={perfil.contratas} />
      </div>
    </div>
  );
}
