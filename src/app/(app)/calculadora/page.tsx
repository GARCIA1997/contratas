"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CalculadoraPrestamo } from "@/components/calculadora/calculadora-prestamo";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getConfiguracion } from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

/**
 * Client component a propósito: antes era Server Component solo para leer
 * dos números de la configuración, lo que la volvía inservible sin señal
 * —justo donde más se ocupa, cotizando frente al cliente en la puerta—.
 * Esos dos valores ya viven en Dexie, así que se leen de ahí.
 */
export default function CalculadoraPage() {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  return (
    <div className="space-y-4 md:max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Calculadora de préstamo
        </h1>
        <p className="text-sm text-muted-foreground">
          Simula un préstamo sin crear nada — útil para cotizar antes de
          registrar la contrata.
        </p>
      </div>

      <CalculadoraPrestamo
        cuotasPorDefecto={config?.cuotasPorDefecto ?? CONFIG_DEFAULTS.cuotasPorDefecto}
        maxCuotas={config?.maxCuotas ?? CONFIG_DEFAULTS.maxCuotas}
      />
    </div>
  );
}
