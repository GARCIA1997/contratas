"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineBootstrap } from "@/components/offline/offline-bootstrap";
import { SyncStatusBadge } from "@/components/offline/sync-status-badge";
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
    <div className="min-h-dvh">
      <OfflineBootstrap ownerId={ownerId} />
      <AppHeader />
      <div className="mx-auto flex max-w-lg justify-end px-4 pt-2">
        <SyncStatusBadge ownerId={ownerId} />
      </div>
      <main className="mx-auto max-w-lg px-4 pb-32 pt-2">{children}</main>
      <BottomNav />
    </div>
  );
}
