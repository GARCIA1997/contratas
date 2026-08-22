"use client";

import Link from "next/link";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { ClientesLista } from "@/components/clientes/clientes-lista";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getClientes } from "@/lib/offline/repo";

export default function ClientesPage() {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready ? claims.esAdmin : false;

  const clientes = useLiveQuery(
    () => (ownerId ? getClientes(ownerId) : undefined),
    [ownerId]
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        {esAdmin && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" asChild>
              <Link href="/clientes/buscar-global">
                <Search className="size-4" /> Otras carteras
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/clientes/nuevo">
                <Plus className="size-4" /> Nuevo
              </Link>
            </Button>
          </div>
        )}
      </div>

      {clientes ? (
        <ClientesLista clientes={clientes} />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      )}
    </div>
  );
}
