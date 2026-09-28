import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

/**
 * Caché de pantallas. "Preparar para trabajar sin señal" precarga TODAS las
 * pantallas (4+ por contrata, 3+ por cliente); con el tope anterior de 32
 * entradas, las primeras se borraban antes de terminar y al salir a ruta
 * no abrían. Las respuestas RSC de estas pantallas pesan pocos KB (la
 * página es cliente y lee de IndexedDB), así que 2000 cabe holgado.
 * 3 días: alcanza para preparar la noche anterior y trabajar el día
 * siguiente aunque se alargue la ruta.
 */
const EXPIRACION_PANTALLAS = {
  maxEntries: 2000,
  maxAgeSeconds: 3 * 24 * 60 * 60,
  purgeOnQuotaError: true,
};

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // `defaultCache` (a diferencia del de next-pwa, escrito antes del App
  // Router) sí reconoce y cachea los fetches RSC de navegación entre
  // páginas — cubre parte del "pantalla en blanco offline" para páginas ya
  // visitadas una vez con red.
  runtimeCaching: [
    // Red de seguridad adicional para el pull-sync (Fase A): si la petición
    // de sincronización se hace con la red inestable, sirve la última copia
    // cacheada. La fuente de verdad real del offline es IndexedDB (ver
    // src/lib/offline/*), esto es solo un respaldo, no el mecanismo principal.
    {
      matcher: /^\/api\/(contratas|clientes|deudores|configuracion|ruta|dashboard\/(kpis|tendencia))(\?.*)?$/,
      method: "GET",
      handler: new NetworkFirst({
        cacheName: "api-get-safety-net",
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    // Reportado en campo: en comunidades con 3G real (no cero señal), las
    // rutas de navegación de `defaultCache` (RSC/RSC-prefetch/documento
    // HTML/"others" — este último es por donde pasa una recarga completa
    // de página) usan NetworkFirst SIN `networkTimeoutSeconds`. Sin ese
    // valor, Workbox espera la respuesta de red indefinidamente antes de
    // caer al cache — si la petición se cuelga (conexión abierta, sin
    // datos), la app se queda en blanco varios minutos en vez de mostrar
    // al toque lo que ya tiene guardado. Estas 4 entradas repiten los
    // mismos matchers y cacheName que `defaultCache` (así comparten el
    // mismo cache, sin duplicar entradas) pero SÍ le ponen un timeout
    // corto: a los 4s sin respuesta, sirve la versión cacheada de una vez.
    // Van antes de `...defaultCache` porque Workbox usa la primera ruta
    // que matchea — estas ganan.
    {
      matcher: ({ request, url: { pathname }, sameOrigin }) =>
        request.headers.get("RSC") === "1" &&
        request.headers.get("Next-Router-Prefetch") === "1" &&
        sameOrigin &&
        !pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages-rsc-prefetch",
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin(EXPIRACION_PANTALLAS),
        ],
      }),
    },
    {
      matcher: ({ request, url: { pathname }, sameOrigin }) =>
        request.headers.get("RSC") === "1" &&
        sameOrigin &&
        !pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages-rsc",
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin(EXPIRACION_PANTALLAS),
        ],
      }),
    },
    {
      matcher: ({ request, url: { pathname }, sameOrigin }) =>
        request.headers.get("Content-Type")?.includes("text/html") === true &&
        sameOrigin &&
        !pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin(EXPIRACION_PANTALLAS),
        ],
      }),
    },
    {
      // Catch-all mismo-origen no-API: por aquí pasa una navegación
      // completa (recarga, primera visita, abrir un link desde fuera de la
      // app) cuando no trae headers de RSC — el caso más común de "abrir
      // la app en campo".
      matcher: ({ url: { pathname }, sameOrigin }) =>
        sameOrigin && !pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "others",
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin(EXPIRACION_PANTALLAS),
        ],
      }),
    },
    ...defaultCache,
  ],
  // `fallbacks.entries` -> `matchPrecache("/offline")` NUNCA funciona en la
  // práctica: el manifiesto de precache que genera @serwist/next para el App
  // Router solo incluye assets (JS/CSS), no el documento HTML de una ruta —
  // así que esta entrada queda muerta desde el día uno. El respaldo real
  // está en `setCatchHandler` de abajo, que cachea "/offline" a mano.
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

const OFFLINE_SHELL_CACHE = "offline-shell";

// Cachea el documento real de "/offline" a mano apenas se instala el SW —
// no depende del precache (ver comentario arriba). Con conexión al momento
// del deploy esto casi siempre tiene éxito; si por lo que sea falla (deploy
// mismo offline), el catchHandler de abajo tiene un último respaldo inline
// que no depende de ningún cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch("/offline")
      .then((res) => caches.open(OFFLINE_SHELL_CACHE).then((c) => c.put("/offline", res)))
      .catch(() => undefined)
  );
});

// HTML mínimo sin ninguna dependencia externa (sin CSS/JS/fuentes) — última
// red de seguridad si ni el cache de instalación ni el precache lograron
// servir algo. Nunca puede fallar, así que aquí SÍ se corta la cadena de
// errores en vez de reintentar y volver a producir "no-response".
const OFFLINE_FALLBACK_HTML = `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión — Kredired</title>
<body style="display:flex;min-height:100vh;align-items:center;justify-content:center;
margin:0;padding:24px;text-align:center;font-family:system-ui,sans-serif;
background:#0a1230;color:#e8ecff">
<div><h1 style="font-size:20px">Sin conexión</h1>
<p style="color:#9aa4c7;max-width:280px">No hay conexión a internet. Las páginas
que ya visitaste siguen disponibles; el resto se cargará al recuperar la señal.</p>
</div></body></html>`;

// Red de seguridad final: si alguna estrategia falla de un modo que ni
// siquiera el fallback por-ruta de arriba logra resolver (reportado en
// campo: Safari mostraba su propio error nativo — "FetchEvent.respondWith
// received an error: no-response" — en vez de la app, navegando sin señal),
// esto evita el crash sirviendo el shell offline para cualquier navegación
// de documento. Deliberadamente nunca deja que una promesa rechazada llegue
// hasta el navegador desde aquí.
serwist.setCatchHandler(async ({ request }) => {
  if (request.destination !== "document") return Response.error();
  const cacheado = await caches.match("/offline", { cacheName: OFFLINE_SHELL_CACHE });
  if (cacheado) return cacheado;
  const precacheado = await serwist.matchPrecache("/offline").catch(() => undefined);
  if (precacheado) return precacheado;
  return new Response(OFFLINE_FALLBACK_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

serwist.addEventListeners();

// Handlers de push (antes en worker/index.js, consolidados aquí con el
// resto de la config del service worker).
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ContratasApp", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ContratasApp";
  const options: NotificationOptions = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            (client as WindowClient).navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
