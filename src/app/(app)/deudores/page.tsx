"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeudoresLista } from "@/components/deudores/deudores-lista";
import { formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getDeudores } from "@/lib/offline/repo";

export default function DeudoresPage() {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready ? claims.esAdmin : false;

  const data = useLiveQuery(
    () => (ownerId ? getDeudores(ownerId) : undefined),
    [ownerId]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Deudores</h1>
        {esAdmin && (
          <Button asChild size="sm">
            <Link href="/deudores/nuevo">
              <Plus className="size-4" /> Nuevo
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <span className="text-sm text-muted-foreground">Deuda viva total</span>
          <span className="text-xl font-bold text-vencido">
            {formatMoneda(data?.deudaViva ?? 0)}
          </span>
        </CardContent>
      </Card>

      {data ? (
        <DeudoresLista deudores={data.deudores} />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      )}
    </div>
  );
}
