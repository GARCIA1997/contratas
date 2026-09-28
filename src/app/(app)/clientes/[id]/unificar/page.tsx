"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { UnificarForm } from "@/components/clientes/unificar-form";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import {
  getClientePerfil,
  getContratasConSaldo,
  getConfiguracion,
  getCita,
} from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function UnificarContratasPage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const citaId = searchParams.get("citaId");
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready && claims.esAdmin;
  // Igual que en renovar: una vez unificadas, las contratas seleccionadas
  // quedan liquidadas y `elegibles` cae debajo de 2 — sin este flag, el
  // efecto de abajo redirige de vuelta antes de que el usuario alcance a
  // ver el panel de confirmación / enviar el recibo por WhatsApp.
  const [completado, setCompletado] = useState(false);

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace(`/clientes/${params.id}`);
  }, [claims.ready, esAdmin, router, params.id]);

  const perfil = useLiveQuery(
    () => (ownerId ? getClientePerfil(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const elegibles = useLiveQuery(
    () => (ownerId ? getContratasConSaldo(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );
  const cita = useLiveQuery(
    () => (ownerId && citaId ? getCita(ownerId, citaId) : undefined),
    [ownerId, citaId]
  );

  useEffect(() => {
    if (completado) return;
    if (elegibles && elegibles.length < 2) {
      router.replace(`/clientes/${params.id}`);
    }
  }, [elegibles, params.id, router, completado]);

  if (
    !claims.ready ||
    !esAdmin ||
    perfil === undefined ||
    perfil === null ||
    !elegibles ||
    (!completado && elegibles.length < 2) ||
    !config
  ) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

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
              contra el saldo pendiente de las contratas que marques.
            </p>
          </CardContent>
        </Card>
      )}
      <UnificarForm
        clienteId={perfil.id}
        ownerId={ownerId}
        clienteNombre={perfil.nombre}
        contratas={elegibles.map((c) => ({ id: c.id, tipo: c.tipo, saldo: c.saldo }))}
        preseleccion={cita?.contratasUnificarIds}
        cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
        maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
        nombreApp={config?.nombreApp ?? CONFIG_DEFAULTS.nombreApp}
        citaId={citaId}
        onUnificada={() => setCompletado(true)}
      />
    </div>
  );
}
