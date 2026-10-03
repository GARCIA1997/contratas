export { default } from "next-auth/middleware";

// Protege las páginas (redirige a /login sin sesión), salvo login/registro,
// el monitor (/monitor, que valida acceso en su propio layout y manda a
// /monitor/login) y assets. Las rutas /api/* quedan fuera a propósito: cada una ya hace su
// propia autorización (requireUser/requireAdmin, o su propio secreto como
// CRON_SECRET en /api/push/recordatorio) y responde 401 en JSON — dejar que
// este middleware las intercepte solo las redirigiría a un HTML de login,
// rompiendo cualquier llamada no-navegador (cron del VPS, futuras
// integraciones) antes de que la ruta pueda siquiera validar su propio
// secreto.
export const config = {
  matcher: [
    "/((?!login|registro|offline|monitor|api/|_next/static|_next/image|favicon.ico|manifest.json|sw.js|worker-.*|workbox-.*|icons/.*).*)",
  ],
};
