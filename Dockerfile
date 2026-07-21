# syntax=docker/dockerfile:1

# ---- deps: instala dependencias (con devDependencies, se necesitan para el build) ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall corre `prisma generate`, que necesita el schema presente.
COPY prisma ./prisma
# @sentry/cli (dependencia transitiva de @sentry/nextjs) descarga un binario
# nativo en su postinstall; en node:20-alpine (musl) esa descarga puede
# colgarse varios minutos y hacer fallar el deploy por timeout. No lo
# necesitamos: no subimos sourcemaps a Sentry desde este build (sin
# SENTRY_AUTH_TOKEN el plugin ya se salta esa parte), así que se salta la
# descarga por completo.
ENV SENTRYCLI_SKIP_DOWNLOAD=1
RUN npm ci

# ---- builder: genera Prisma Client, aplica migraciones y compila Next.js ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# La build necesita una DATABASE_URL válida solo para `prisma generate`
# (no se conecta a la DB en este paso). `prisma migrate deploy` se corre
# en runtime (ver docker-compose.yml / entrypoint), no aquí, para no
# depender de que la DB ya esté arriba durante el build de la imagen.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build -- --no-lint 2>/dev/null || npx next build

# ---- runner: imagen final mínima ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Sin esto el proceso corre en UTC (default de la imagen base) — como toda
# la lógica de fechas (vencido/próximo, corte de caja, ruta del día) usa
# `new Date()` como "hoy", una contrata con cobro hoy podía marcarse
# "vencida" hasta 6 horas antes de tiempo (medianoche-6am hora de México
# ya es "mañana" en UTC). node:20-alpine trae el ICU completo, así que
# alcanza con la variable — no hace falta instalar tzdata aparte.
ENV TZ=America/Mexico_City

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# El CLI de prisma (para `migrate deploy` en el entrypoint) trae varias
# dependencias transitivas propias (@prisma/config, effect, etc.) — más
# simple y robusto copiar node_modules completo que perseguir cada una.
COPY --from=builder /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
