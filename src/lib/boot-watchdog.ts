const MARKER_ATTR = "data-app-mounted";
const TIMEOUT_MS = 12000;

/**
 * Script inline para el <head>: última red de seguridad para la pantalla en
 * blanco. Independiente de React (corre antes de que cualquier bundle se
 * ejecute) y del service worker — cubre el caso en que NI la app real NI
 * "/offline" lograron montar (primera visita sin red y sin nada cacheado
 * aún, o un error que impide que React arranque). Si `BootWatchdogMarker`
 * (ver ese archivo) no confirma el montaje dentro de TIMEOUT_MS, reemplaza
 * el body a mano con un mensaje + botón de recarga, sin depender de CSS ni
 * JS externo.
 */
export const BOOT_WATCHDOG_SCRIPT = `
(function () {
  window.setTimeout(function () {
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
  }, ${TIMEOUT_MS});
})();
`;
