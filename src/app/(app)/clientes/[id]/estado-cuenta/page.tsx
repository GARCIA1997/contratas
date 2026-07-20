"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { EstadoCuentaView } from "@/components/clientes/estado-cuenta-view";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getEstadoCuentaCliente, getConfiguracion } from "@/lib/offline/repo";

export default function EstadoCuentaClientePage() {
  const claims = useAuthClaims();
  const params = useParams<{ id: string }>();
  const ownerId = claims.ready ? claims.ownerId : null;

  const cliente = useLiveQuery(
    () => (ownerId ? getEstadoCuentaCliente(ownerId, params.id) : undefined),
    [ownerId, params.id]
  );
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  if (cliente === undefined || config === undefined) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  if (cliente === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cliente no encontrado.
      </p>
    );
  }

  return (
    <EstadoCuentaView
      nombreApp={config?.nombreApp ?? "Kredired"}
      cliente={{
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        totales: cliente.totales,
        contratas: cliente.contratas.map((c) => ({
          id: c.id,
          tipo: c.tipo,
          monto: c.monto,
          abono: c.abono,
          numCuotas: c.numCuotas,
          pagados: c.pagados,
          total: c.total,
          saldo: c.saldo,
          estado: c.estado,
          totalAbonado: c.totalAbonado,
          pagos: c.pagos.map((p) => ({
            numeroCuota: p.numeroCuota,
            fechaProgramada: p.fechaProgramada,
            pagado: p.pagado,
            montoAbonado: p.montoAbonado,
          })),
        })),
      }}
    />
  );
}
