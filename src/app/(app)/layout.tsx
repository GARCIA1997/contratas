"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { OfflineBootstrap } from "@/components/offline/offline-bootstrap";
import { ControlSync } from "@/components/offline/control-sync";
import { CalculadoraBasicaBoton } from "@/components/calculadora/calculadora-basica-boton";
import { OfflineToast } from "@/components/offline/offline-toast";
import { InstalarAndroidBanner } from "@/components/pwa/instalar-android-banner";
import { VersionBadge } from "@/components/version-badge";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = useAuthClaims();
  const router = useRouter();

  const ownerId = claims.ready ? claims.ownerId : null;

  useEffect(() => {
    if (claims.ready && !ownerId) {
      router.replace("/login");
    }
  }, [claims.ready, ownerId, router]);

  // Nota: este gate es solo de UI para decidir qué renderizar sin depender
  // de un round-trip al servidor (funciona offline con claims cacheados).
  // La autorización real sigue viviendo en requireUser/requireAdmin de cada
  // API route — este chequeo no reemplaza esa barrera.
  if (!claims.ready || !ownerId) {
    return null;
  }

  return (
    // md:flex + SidebarNav: a partir de tablet la navegación pasa a un
    // sidebar fijo a la izquierda (BottomNav se oculta) y el contenido usa
    // el ancho disponible en vez de quedar centrado a 512px. Sin prefijo
    // `md:`/`lg:` nada cambia — el celular queda pixel-igual.
    <div className="min-h-dvh md:flex">
      <OfflineToast />
      <InstalarAndroidBanner />
      <OfflineBootstrap ownerId={ownerId} />
      <SidebarNav />
      <div className="min-w-0 flex-1">
        <AppHeader />
        <div className="mx-auto flex max-w-lg items-center justify-end gap-2 px-4 pt-2 md:max-w-3xl lg:max-w-5xl">
          <CalculadoraBasicaBoton />
          <ControlSync ownerId={ownerId} />
          <VersionBadge />
        </div>
        <main className="mx-auto max-w-lg px-4 pb-32 pt-2 md:max-w-3xl md:pb-8 lg:max-w-5xl">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
