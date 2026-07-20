import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

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
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
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
