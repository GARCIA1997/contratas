# ContratasApp

PWA de gestión de contratas (préstamos personales semanales y quincenales). Ver el PRD para el alcance completo.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS** + **shadcn/ui**
- **Prisma 6** + **PostgreSQL**
- **NextAuth.js** (credenciales + Google OAuth) con roles `ADMIN` / `VIEWER`
- **next-pwa** (instalable, offline)

## Puesta en marcha

1. **Variables de entorno** — copia `.env.example` a `.env` y ajusta:

   ```bash
   cp .env.example .env
   ```

   Como mínimo configura `DATABASE_URL` (PostgreSQL) y `NEXTAUTH_SECRET`
   (`openssl rand -base64 32`).

2. **Base de datos** — con Postgres corriendo, aplica el schema:

   ```bash
   npm run db:push      # o: npm run db:migrate para migraciones versionadas
   ```

3. **Seed** — crea la configuración inicial y el usuario admin
   (usa `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`):

   ```bash
   npm run db:seed
   ```

4. **Desarrollo**:

   ```bash
   npm run dev
   ```

   Abre http://localhost:3000 → serás redirigido a `/login`.

## Scripts de base de datos

| Script | Descripción |
|---|---|
| `npm run db:generate` | Regenera el cliente Prisma |
| `npm run db:push` | Sincroniza el schema con la DB (sin migraciones) |
| `npm run db:migrate` | Crea y aplica una migración versionada |
| `npm run db:seed` | Configuración inicial + usuario admin |
| `npm run db:studio` | Explora la DB con Prisma Studio |

## Estructura (Fase 1)

```
prisma/
  schema.prisma        Modelo de datos completo (PRD) + auth
  seed.ts              Config inicial + admin
src/
  app/
    (app)/             Grupo protegido con shell PWA (header + bottom nav)
      page.tsx         Dashboard (KPIs — Fase 3)
      semanales/       CRUD contratas — Fase 2
      quincenales/
      deudores/        Fase 4
      config/          Settings — Fase 6
    login/             Pantalla de login
    api/auth/          NextAuth
  components/
    ui/                shadcn/ui (button, card, input, label)
    bottom-nav.tsx     Navegación inferior (5 secciones)
    app-header.tsx     Header con nombre de app + logout
  lib/
    auth.ts            Config NextAuth (credenciales + Google, roles)
    prisma.ts          Cliente Prisma singleton
    config.ts          Lectura de configuración con fallback
  middleware.ts        Protege todas las rutas salvo /login
```

## PWA: offline, instalación y notificaciones

- **Offline**: `next-pwa` genera el service worker en `build` (deshabilitado en
  `dev`). Las páginas visitadas quedan en caché; sin conexión y sin caché se
  muestra `/offline`.
- **Instalación**: botón en Settings (usa `beforeinstallprompt`); en iOS se
  instala con «Añadir a pantalla de inicio».
- **Notificaciones push (opcional)** — recordatorio de cobros del día:
  1. Genera claves: `npx web-push generate-vapid-keys`
  2. Pon `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` en `.env`.
     Sin claves, la función se desactiva sola.
  3. Cada usuario activa las notificaciones desde Settings → Notificaciones.
  4. Envío diario a todos: `POST /api/push/recordatorio` con cabecera
     `x-cron-secret: <CRON_SECRET>` (programar con crontab, ver `deploy/crontab.example`).
     El botón «Probar» envía el recordatorio solo al usuario actual.

> El push se compila e integra vía `worker/index.js` (handlers `push` y
> `notificationclick`). La entrega real requiere HTTPS (o localhost) y un
> navegador compatible.

## Estado de resultados: corte de caja mensual

- Cierre congelado por mes (contratas dadas vs. cobrado, ganancia real,
  cartera pendiente al cierre) — Configuración → Estado de resultados.
- Se genera solo el último día de cada mes vía `GET /api/cron/corte-caja`
  (cabecera `x-cron-secret: <CRON_SECRET>`, ver `deploy/crontab.example`),
  o manualmente desde la UI (botón "Generar/actualizar").
- Regenerar un mes ya cerrado sobrescribe el corte anterior — pensado para
  corregir un cierre tras ajustar datos, no para llevar versiones.
- Cada corte se puede descargar en PDF (`@react-pdf/renderer`, sin
  dependencia de Chromium — importante en el VPS de 1 vCPU).

## Aislamiento por usuario

Cada usuario solo ve/gestiona **sus** contratas, clientes, deudores y su propia
configuración (tasas, cuotas, colores, nombre). El rol `ADMIN`/`VIEWER` controla
escritura vs. lectura dentro de los datos propios; la gestión de usuarios es una
capacidad global de cualquier ADMIN.

## Estado

**Fases 1–7 completadas** (auth, CRUD contratas, dashboard, deudores, clientes,
settings + usuarios, PWA). Despliegue: ver [DEPLOY.md](DEPLOY.md) (VPS).
