import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MonitorShell } from "@/components/monitor/shell";
import { getSalud, requireMonitor } from "@/lib/monitor/datos";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Sin sesión o sin permiso → al login del monitor (no al de la app).
  const user = await requireMonitor().catch(() => null);
  if (!user) {
    // Con sesión pero sin permiso: se le dice en el login, en vez de
    // regresarlo ahí sin explicación.
    const conSesion = await requireUser().then(() => true, () => false);
    redirect(conSesion ? "/monitor/login?sin-acceso=1" : "/monitor/login");
  }
  const salud = await getSalud();
  return (
    <Suspense>
      <MonitorShell
        nombre={user.nombre ?? user.email}
        version={salud.version}
        saludOk={salud.db && salud.operacionesAtoradas === 0}
      >
        {children}
      </MonitorShell>
    </Suspense>
  );
}
