"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfigForm } from "@/components/config/config-form";
import { InstallButton } from "@/components/pwa/install-button";
import { NotificacionesPanel } from "@/components/pwa/notificaciones-panel";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { getConfiguracion } from "@/lib/offline/repo";
import { CONFIG_DEFAULTS } from "@/lib/config";

export default function ConfigPage() {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const esAdmin = claims.ready ? claims.esAdmin : false;

  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>

      {!esAdmin && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Solo un usuario ADMIN puede modificar la configuración.
          </CardContent>
        </Card>
      )}

      <ConfigForm inicial={config ?? CONFIG_DEFAULTS} soloLectura={!esAdmin} />

      {esAdmin && (
        <Button variant="outline" className="w-full" asChild>
          <Link href="/config/usuarios">
            <Users className="size-4" /> Gestión de usuarios
          </Link>
        </Button>
      )}

      <div className="space-y-2 pt-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Aplicación
        </h2>
        <InstallButton />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Notificaciones
        </h2>
        <NotificacionesPanel />
      </div>
    </div>
  );
}
