import withPWAInit from "next-pwa";
import defaultCache from "next-pwa/cache.js";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // El service worker solo se genera en producción para no interferir en dev.
  disable: process.env.NODE_ENV === "development",
  // Página mostrada cuando se navega sin conexión y no hay caché.
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    // Red de seguridad adicional para el pull-sync (Fase A): si la petición
    // de sincronización se hace con la red inestable, sirve la última copia
    // cacheada. La fuente de verdad real del offline es IndexedDB (ver
    // src/lib/offline/*), esto es solo un respaldo, no el mecanismo principal.
    {
      urlPattern: /^\/api\/(contratas|clientes|deudores|configuracion|dashboard\/kpis)(\?.*)?$/,
      method: "GET",
      handler: "NetworkFirst",
      options: {
        cacheName: "api-get-safety-net",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    ...defaultCache,
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone: genera .next/standalone con un server.js autocontenido,
  // ideal para Docker (imagen mínima) y también funciona con PM2/`node server.js`.
  output: "standalone",
  experimental: {
    // El router de App Router revalida el RSC payload de una ruta ya
    // visitada cuando su entrada en el Router Cache queda "stale" (default:
    // 30s para rutas dinámicas). Sin red esa revalidación falla y cae a una
    // navegación de documento completo, rompiendo el offline aunque la
    // página ya se haya visitado. Subir el staleTime evita esa revalidación
    // innecesaria — los datos reales igual vienen de IndexedDB (useLiveQuery),
    // así que servir el shell cacheado del router más tiempo no muestra
    // información vieja.
    staleTimes: {
      dynamic: 3600,
      static: 3600,
    },
  },
  // El service worker nunca debe quedar cacheado por el navegador o un
  // proxy intermedio (CDN, nginx) — si un despliegue nuevo cambia su
  // contenido y un cliente sigue sirviendo la versión vieja, la app queda
  // atascada en el build anterior indefinidamente. Esto es la fuente de
  // verdad (Next la sirve directo); nginx en el VPS repite la misma
  // cabecera como defensa adicional (ver deploy/nginx.conf.example).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default withPWA(nextConfig);
