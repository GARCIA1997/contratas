"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  esAndroid,
  estadoInstalador,
  instalarApp,
  suscribirseAInstalador,
} from "@/lib/pwa/instalador";

const CLAVE_OCULTO_HASTA = "kredired:instalar-banner-oculto-hasta";
/** Si el usuario dice "ahora no", no se le vuelve a insistir por 2 semanas. */
const DIAS_COOLDOWN = 14;

function ocultoPorCooldown(): boolean {
  if (typeof localStorage === "undefined") return false;
  const hasta = localStorage.getItem(CLAVE_OCULTO_HASTA);
  return hasta !== null && Date.now() < Number(hasta);
}

function posponer() {
  try {
    localStorage.setItem(
      CLAVE_OCULTO_HASTA,
      String(Date.now() + DIAS_COOLDOWN * 86_400_000)
    );
  } catch {
    // Modo privado o cuota llena: en el peor caso se vuelve a preguntar en
    // la próxima sesión, no es grave.
  }
}

/**
 * Aviso automático para instalar la app en Android, montado una sola vez en
 * el layout — se ofrece solo, sin que el usuario tenga que ir a buscarlo a
 * Configuración.
 *
 * Solo en Android y solo cuando el navegador ya ofreció el instalador
 * nativo (`beforeinstallprompt`): en cualquier otro caso no hay nada que
 * este banner pueda hacer que el botón de Configuración no haga ya, y
 * mostrar un aviso que no lleva a ningún lado es peor que no mostrar nada.
 *
 * Deliberadamente NO es un `alert()` nativo ni se auto-dispara el diálogo
 * de instalación al entrar: la mayoría de navegadores ignoran o penalizan
 * llamar `.prompt()` sin que el usuario haya tocado algo primero, y un
 * `alert()` bloqueante en cuanto se abre la app es la clase de cosa que
 * hace que la gente desconfíe y cierre la app de inmediato. Este es un
 * banner descartable de toda la vida: se puede ignorar y seguir usando la
 * app sin fricción.
 */
export function InstalarAndroidBanner() {
  const [montado, setMontado] = useState(false);
  const [estado, setEstado] = useState(estadoInstalador());
  const [visible, setVisible] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    setMontado(true);
    setVisible(!ocultoPorCooldown());
    return suscribirseAInstalador(() => setEstado(estadoInstalador()));
  }, []);

  const mostrar =
    montado && visible && esAndroid() && estado.instalable && !estado.instalada;

  if (!mostrar) return null;

  async function instalar() {
    setInstalando(true);
    try {
      const resultado = await instalarApp();
      // "rechazado" no se pospone con cooldown: el usuario ya vio el
      // diálogo nativo y decidió ahí mismo, insistir de nuevo en el acto
      // sería redundante — pero tampoco se le sigue mostrando este banner
      // en la misma sesión porque el evento nativo ya se consumió.
      if (resultado !== "no-disponible") setVisible(false);
    } finally {
      setInstalando(false);
    }
  }

  function cerrar() {
    posponer();
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 px-4 md:hidden">
      <div className="glass mx-auto flex max-w-lg items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.25)]">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Instala Kredired</p>
          <p className="text-xs leading-tight text-muted-foreground">
            Úsala sin conexión, desde el icono de tu pantalla de inicio.
          </p>
        </div>
        <Button size="sm" disabled={instalando} onClick={instalar}>
          {instalando ? "…" : "Instalar"}
        </Button>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Ahora no"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
