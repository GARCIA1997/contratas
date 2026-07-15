import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Sin conexión — Kredired",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="size-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">Sin conexión</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        No hay conexión a internet. Las páginas que ya visitaste siguen
        disponibles; el resto se cargará al recuperar la señal.
      </p>
    </div>
  );
}
