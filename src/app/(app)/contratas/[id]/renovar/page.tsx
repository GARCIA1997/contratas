"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { RenovarForm } from "@/components/contratas/renovar-form";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { entregarCita } from "@/components/citas/entregar-cita";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getContrata,
  getContratasConVencido,
  getConfiguracion,
  getCita,
} from "@/lib/offline/repo";
import { saldoPendiente } from "@/lib/contrata";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function RenovarContrataPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const citaId = searchParams.get("citaId");
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;
  // Una vez renovada, la contrata original queda liquidada (saldo 0) — sin
  // este flag, el efecto de abajo la detecta como "ya no elegible" y
  // redirige de vuelta ANTES de que el usuario alcance a ver el panel de
  // confirmación / enviar el recibo por WhatsApp.
  const [completado, setCompletado] = useState(false);

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace(`/contratas/${params.id}`);
  }, [claims.ready, esAdmin, router, params.id]);

  const contrata = useLiveQuery(
    () => (ownerId ? getContrata(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );
  const otras = useLiveQuery(
    () =>
      ownerId && contrata
        ? getContratasConVencido(ownerId, contrata.clienteId, contrata.id)
        : undefined,
    [ownerId, contrata]
  );
  const cita = useLiveQuery(
    () => (ownerId && citaId ? getCita(ownerId, citaId) : undefined),
    [ownerId, citaId]
  );

  useEffect(() => {
    if (completado) return;
    if (contrata === null) {
      router.replace("/contratas");
      return;
    }
    if (contrata && contrata.convertidaADeuda) {
      router.replace(`/contratas/${params.id}`);
      return;
    }
    if (
      contrata &&
      saldoPendiente(
        contrata.pagos.map((p) => ({
          ...p,
          fechaProgramada: new Date(p.fechaProgramada),
        })),
        contrata.abono
      ) <= 0
    ) {
      router.replace(`/contratas/${params.id}`);
    }
  }, [contrata, params.id, router, completado]);

  if (
    !claims.ready ||
    !esAdmin ||
    contrata === undefined ||
    contrata === null ||
    contrata.convertidaADeuda ||
    !config ||
    !otras
  ) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  const saldoOriginal = saldoPendiente(
    contrata.pagos.map((p) => ({
      ...p,
      fechaProgramada: new Date(p.fechaProgramada),
    })),
    contrata.abono
  );

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
            <p className="text-xs text-muted-foreground">
              Solo de referencia — el monto real a cubrir se calcula en vivo
              contra el saldo pendiente.
            </p>
          </CardContent>
        </Card>
      )}
      <RenovarForm
        contrataId={contrata.id}
        ownerId={ownerId}
        clienteNombre={contrata.clienteNombre}
        tipoOriginal={contrata.tipo}
        saldoOriginal={saldoOriginal}
        otras={otras.map((c) => ({ id: c.id, tipo: c.tipo, saldo: c.saldo }))}
        cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
        maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
        nombreApp={config?.nombreApp ?? CONFIG_DEFAULTS.nombreApp}
        onRenovada={(info) => {
          setCompletado(true);
          if (citaId && ownerId && info) void entregarCita(ownerId, citaId, info);
        }}
      />
    </div>
  );
}
