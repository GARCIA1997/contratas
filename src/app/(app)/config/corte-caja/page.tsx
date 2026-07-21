import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listCortesCaja } from "@/lib/services/corte-caja";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GenerarCorteBoton } from "@/components/corte-caja/generar-corte-boton";
import { DescargarPdfBoton } from "@/components/corte-caja/descargar-pdf-boton";

function moneda(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const dynamic = "force-dynamic";

export default async function CorteCajaPage() {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect("/config");

  const cortes = await listCortesCaja(user.ownerId);
  const hoy = new Date();

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/config">
          <ArrowLeft className="size-4" /> Configuración
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Estado de resultados
        </h1>
        <p className="text-sm text-muted-foreground">
          Corte de caja mensual: contratas dadas vs. cobrado. Se genera solo
          el último día de cada mes; también puedes generarlo o
          regenerarlo manualmente.
        </p>
      </div>

      <GenerarCorteBoton anio={hoy.getFullYear()} mes={hoy.getMonth() + 1} />

      {cortes.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay cortes de caja generados.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {cortes.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {MESES[c.mes - 1]} {c.anio}
                    </p>
                    <DescargarPdfBoton corteId={c.id} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Contratas dadas ({c.numContratasDadas})
                      </p>
                      <p className="truncate text-sm font-semibold">
                        {moneda(c.contratasDadas)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Cobrado</p>
                      <p className="truncate text-sm font-semibold text-primary">
                        {moneda(c.cobrado)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Ganancia (interés)
                      </p>
                      <p className="truncate text-sm font-semibold">
                        {moneda(c.gananciaInteres)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Saldo pendiente
                      </p>
                      <p className="truncate text-sm font-semibold">
                        {moneda(c.saldoPendienteFin)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
