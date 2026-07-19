import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listAuditoria } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const ACCION_LABEL: Record<string, string> = {
  "contrata.eliminar": "Eliminó una contrata",
  "contrata.marcarDeuda": "Marcó una contrata como deuda",
  "cliente.eliminar": "Eliminó un cliente",
  "deudor.eliminar": "Eliminó un deudor",
  "pago.revertir": "Revirtió un pago",
  "usuario.crear": "Creó un usuario",
  "usuario.actualizar": "Actualizó un usuario",
  "usuario.eliminar": "Eliminó un usuario",
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resumenDetalle(detalle: Record<string, unknown> | null): string | null {
  if (!detalle) return null;
  const partes: string[] = [];
  if (typeof detalle.cliente === "string") partes.push(detalle.cliente);
  if (typeof detalle.email === "string") partes.push(detalle.email as string);
  if (typeof detalle.rol === "string") partes.push(`rol ${detalle.rol}`);
  if (typeof detalle.cuota === "number") partes.push(`cuota ${detalle.cuota}`);
  if (typeof detalle.monto === "number")
    partes.push(`$${(detalle.monto as number).toLocaleString("es-MX")}`);
  if (typeof detalle.deudorNombre === "string")
    partes.push(detalle.deudorNombre as string);
  return partes.length ? partes.join(" · ") : null;
}

export default async function AuditoriaPage() {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect("/config");

  const entradas = await listAuditoria(user.ownerId, 150);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/config">
          <ArrowLeft className="size-4" /> Configuración
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Actividad</h1>
        <p className="text-sm text-muted-foreground">
          Acciones sensibles del espacio (eliminaciones, deudas, cambios de
          usuario), las más recientes primero.
        </p>
      </div>

      {entradas.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay actividad registrada.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-1.5">
          {entradas.map((e) => {
            const detalle = resumenDetalle(e.detalle);
            return (
              <li key={e.id}>
                <div className="rounded-2xl border border-border/60 bg-secondary/30 px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {ACCION_LABEL[e.accion] ?? e.accion}
                    </p>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {fecha(e.creadoEn)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.actorNombre ?? "Usuario"}
                    {detalle ? ` — ${detalle}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
