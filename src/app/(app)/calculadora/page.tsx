import { requireUser } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { CalculadoraPrestamo } from "@/components/calculadora/calculadora-prestamo";

export const dynamic = "force-dynamic";

export default async function CalculadoraPage() {
  const user = await requireUser();
  const config = await getConfig(user.ownerId);

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
        cuotasPorDefecto={config.cuotasPorDefecto}
        maxCuotas={config.maxCuotas}
      />
    </div>
  );
}
