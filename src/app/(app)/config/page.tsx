"use client";

import Link from "next/link";
import {
  Users,
  ScrollText,
  FileBarChart,
  ChartNoAxesCombined,
} from "lucide-react";
import { OfflineAwareLink } from "@/components/offline/offline-aware-link";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfigForm } from "@/components/config/config-form";
import { InstallButton } from "@/components/pwa/install-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificacionesPanel } from "@/components/pwa/notificaciones-panel";
import { DiagnosticoSync } from "@/components/offline/diagnostico-sync";
import { WhatsAppAutomatico } from "@/components/config/whatsapp-automatico";
import { AppWhatsAppSelector } from "@/components/config/app-whatsapp";
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
    <div className="space-y-4 md:max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>

      {!esAdmin && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Solo un usuario ADMIN puede modificar la configuración.
          </CardContent>
        </Card>
      )}

      {/*
        ConfigForm siembra su estado desde `inicial` solo al montar (useState
        initializer). Si esta página monta antes de que useLiveQuery resuelva
        la config real desde IndexedDB, `config` llega undefined por un
        instante y el formulario quedaría anclado a CONFIG_DEFAULTS aunque
        luego lleguen los valores reales. La key fuerza exactamente un
        remount cuando pasa de "cargando" a "cargado", sin resetear lo que el
        usuario esté escribiendo en saves posteriores (config ya no es
        undefined después del primero).
      */}
      <ConfigForm
        key={config ? "cargado" : "cargando"}
        inicial={config ?? CONFIG_DEFAULTS}
        soloLectura={!esAdmin}
      />

      {esAdmin && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" asChild>
            <OfflineAwareLink href="/config/usuarios">
              <Users className="size-4" /> Usuarios
            </OfflineAwareLink>
          </Button>
          <Button variant="outline" asChild>
            <OfflineAwareLink href="/config/auditoria">
              <ScrollText className="size-4" /> Actividad
            </OfflineAwareLink>
          </Button>
          {/* El reporte usa Link normal (es un Client Component que lee de
              IndexedDB y abre sin señal); los cortes de caja sí son
              server-side, así que van con OfflineAwareLink para no dejar la
              pantalla en blanco al tocarlos sin conexión. */}
          <Button variant="outline" asChild>
            <Link href="/estado-resultados">
              <ChartNoAxesCombined className="size-4" /> Estado de resultados
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <OfflineAwareLink href="/config/corte-caja">
              <FileBarChart className="size-4" /> Cortes
            </OfflineAwareLink>
          </Button>
        </div>
      )}

      <div className="space-y-2 pt-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Aplicación
        </h2>
        <InstallButton />
        <ThemeToggle />
        <AppWhatsAppSelector />
      </div>

      <WhatsAppAutomatico editable={esAdmin} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Notificaciones
        </h2>
        <NotificacionesPanel />
      </div>

      {ownerId && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Sincronización
          </h2>
          <DiagnosticoSync ownerId={ownerId} />
        </div>
      )}
    </div>
  );
}
