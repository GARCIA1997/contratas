"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { onOfflineBlocked } from "@/lib/offline/offline-toast";

/**
 * Montado una sola vez en el layout: muestra un aviso breve cuando
 * `OfflineAwareLink` bloquea una navegación por falta de conexión, en vez
 * de dejar que la pantalla se quede en blanco por un fetch RSC fallido.
 */
export function OfflineToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return onOfflineBlocked(() => {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    });
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
        <WifiOff className="size-3.5" />
        Esta pantalla necesita conexión a internet
      </div>
    </div>
  );
}
