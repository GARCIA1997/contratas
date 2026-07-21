import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Solo activo en producción y si hay DSN configurado — en dev/CI/tests no
  // hace falta reportar nada ni requiere credenciales.
  enabled: process.env.NODE_ENV === "production" && !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
