"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import type { TipoContrata } from "@prisma/client";
import { ContrataForm } from "@/components/contratas/contrata-form";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { anclarFechaCliente } from "@/lib/fechas";
import { entregarCita } from "@/components/citas/entregar-cita";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getClientes, getConfiguracion, getCita } from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function NuevaContrataPage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace("/contratas");
  }, [claims.ready, esAdmin, router]);

  const clientes = useLiveQuery(
    () => (ownerId ? getClientes(ownerId) : undefined),
    [ownerId]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );
  const citaId = searchParams.get("citaId");
  const cita = useLiveQuery(
    () => (ownerId && citaId ? getCita(ownerId, citaId) : undefined),
    [ownerId, citaId]
  );

  if (!claims.ready || !esAdmin || !clientes || !config) return null;
  // Al convertir una cita se espera a leerla: el tipo inicial sale de su
  // periodicidad y el formulario solo lo toma al montarse.
  if (citaId && cita === undefined) return null;

  const tipoParam = searchParams.get("tipo");
  const tipoInicial: TipoContrata =
    tipoParam === "QUINCENAL"
      ? "QUINCENAL"
      : tipoParam === "MENSUAL"
        ? "MENSUAL"
        : tipoParam === "SEMANAL"
          ? "SEMANAL"
          : cita?.periodicidad ?? "SEMANAL";

  const clienteIdParam = searchParams.get("clienteId");
  const opciones = clientes.map((c) => ({ id: c.id, nombre: c.nombre }));
  const clientePreseleccionado = clienteIdParam
    ? opciones.find((c) => c.id === clienteIdParam)
    : undefined;

  return (
    <div className="space-y-4 md:max-w-xl">
      {cita && (
        <Card className="border-dashed">
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="font-medium">
              Cita agendada: {formatMoneda(cita.montoEstimado)}
            </p>
            {cita.notas && (
              <p className="text-xs text-muted-foreground">{cita.notas}</p>
            )}
          </CardContent>
        </Card>
      )}
      <ContrataForm
        clientes={opciones}
        cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
        maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
        tipoInicial={tipoInicial}
        nombreApp={config?.nombreApp ?? "Kredired"}
        clientePreseleccionado={clientePreseleccionado}
        volverHref={
          clientePreseleccionado
            ? `/clientes/${clientePreseleccionado.id}`
            : "/contratas"
        }
        montoInicial={cita?.montoEstimado}
        fechaInicioInicial={
          cita ? anclarFechaCliente(cita.fechaEntrega).toISOString().slice(0, 10) : undefined
        }
        onGuardada={(info) => {
          if (citaId && ownerId) void entregarCita(ownerId, citaId, info);
        }}
      />
    </div>
  );
}
