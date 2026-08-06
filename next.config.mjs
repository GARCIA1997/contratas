import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  // El service worker solo se genera en producción para no interferir en dev.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone: genera .next/standalone con un server.js autocontenido,
  // ideal para Docker (imagen mínima) y también funciona con PM2/`node server.js`.
  output: "standalone",
  // El VPS de producción tiene un solo vCPU: el paso de type-check de
  // `next build` (webpack/tsc asumiendo varios núcleos) llegó a saturar la
  // CPU al punto de tumbar SSH/HTTP por varios minutos y de exceder el
  // timeout del deploy. tsc --noEmit y `next lint` ya corren completos en
  // CI (GitHub Actions, con varios núcleos) antes de que cualquier cosa
  // llegue a main — repetirlo aquí es trabajo redundante en la máquina más
  // limitada de todas. Si algún día se despliega sin pasar por ese CI,
  // quitar esto.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Sin SENTRY_AUTH_TOKEN (dev local, o VPS sin cuenta de Sentry configurada
  // aún) el plugin simplemente no sube sourcemaps — el build sigue
  // funcionando normal, solo los stack traces en Sentry no estarán
  // "des-minificados" hasta que se configure.
  silent: true,
  widenClientFileUpload: true,
  // El túnel evita que ad-blockers bloqueen las peticiones a Sentry desde el
  // cliente (petición pasa por nuestro propio dominio en vez de ingest.sentry.io).
  tunnelRoute: "/monitoring",
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
