const MARKER_ATTR = "data-app-mounted";
// Cuánto esperar DESPUÉS de que el navegador terminó de bajar todos los
// recursos de la página antes de dar por muerta la hidratación de React.
// No dispara mientras la página siga activamente cargando (3G real) — solo
// cuando ya no hay nada pendiente y aun así no montó.
const GRACE_AFTER_LOAD_MS = 8000;
// Respaldo absoluto por si el evento "load" nunca dispara (una petición
// que se queda colgada sin resolver ni fallar) — deliberadamente holgado
// para no cortar una carga en 3G real que sigue avanzando, solo la que de
// plano se congeló.
const HARD_TIMEOUT_MS = 45000;

/**
 * Script inline para el <head>: última red de seguridad para la pantalla en
 * blanco. Independiente de React (corre antes de que cualquier bundle se
 * ejecute) y del service worker — cubre el caso en que NI la app real NI
 * "/offline" lograron montar (primera visita sin red y sin nada cacheado
 * aún, o un error que impide que React arranque).
 *
 * Reportado en campo: en comunidades el problema casi nunca es "cero señal"
 * — es 3G real, donde el bundle simplemente tarda más en bajar. Un timeout
 * fijo corto detonaba el fallback justo en medio de una carga que iba a
 * terminar sola, interrumpiendo a alguien que sí podía seguir trabajando.
 * Por eso el disparador real es "el navegador ya no tiene nada pendiente
 * que cargar" (evento `load`) + un margen extra para la hidratación, no un
 * reloj fijo desde que se abrió la página. El HARD_TIMEOUT_MS de abajo es
 * solo el último respaldo si ni siquiera `load` llega a disparar.
 */
export const BOOT_WATCHDOG_SCRIPT = `
(function () {
  function mostrarFallback() {
    if (document.documentElement.hasAttribute("${MARKER_ATTR}")) return;
    try {
      var online = navigator.onLine;
      var msg = online
        ? "Ocurrió un problema al cargar la app."
        : "Sin conexión y no se pudo cargar la versión guardada.";
      document.body.innerHTML =
        '<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;' +
        'margin:0;padding:24px;text-align:center;font-family:system-ui,sans-serif;' +
        'background:#0a1230;color:#e8ecff">' +
        '<div><h1 style="font-size:20px;margin:0 0 8px">No se pudo cargar</h1>' +
        '<p style="color:#9aa4c7;max-width:280px;margin:0 0 16px">' + msg + '</p>' +
        '<button onclick="location.reload()" style="padding:10px 20px;border-radius:8px;' +
        'border:none;background:#3b5bfd;color:#fff;font-size:14px;font-weight:600;cursor:pointer">' +
        'Recargar</button></div></div>';
    } catch (e) {}
  }
  function despuesDeCargar() {
    window.setTimeout(mostrarFallback, ${GRACE_AFTER_LOAD_MS});
  }
  if (document.readyState === "complete") {
    despuesDeCargar();
  } else {
    window.addEventListener("load", despuesDeCargar);
  }
  window.setTimeout(mostrarFallback, ${HARD_TIMEOUT_MS});
})();
`;
