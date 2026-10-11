# Deploy — Kredired

Despliegue en **VPS (Hostinger KVM1 u otro Linux self-managed)**.

El local sigue funcionando exactamente igual con `npm run dev` contra tu Postgres local; nada de lo de abajo lo toca.

---

## Despliegue en VPS (Hostinger KVM1)

El repo trae dos formas de correr en el VPS — elige una:

- **Docker Compose** (`Dockerfile` + `docker-compose.yml`): más aislado, incluye Postgres en un contenedor. Recomendado si no quieres instalar Postgres a mano.
- **PM2 nativo** (`ecosystem.config.js`): más ligero en RAM/CPU, útil en un KVM1 de 1 vCPU si ya tienes Postgres instalado en el propio VPS.

Next.js está configurado con `output: "standalone"` (`next.config.mjs`), así que ambas rutas usan el mismo build optimizado (`.next/standalone/server.js`).

### 1. Preparar el VPS

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Nginx (reverse proxy) y certbot (SSL)
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Si eliges la opción PM2 (sin Docker):
sudo npm install -g pm2
sudo apt-get install -y postgresql postgresql-contrib

# Si eliges Docker Compose:
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y docker-compose-plugin
```

### 2. Clonar el repo y configurar `.env`

```bash
git clone <tu-repo> kredired && cd kredired
cp .env.example .env
# Edita .env: DATABASE_URL, NEXTAUTH_SECRET (openssl rand -base64 32),
# NEXTAUTH_URL="https://kredired.cloud", ADMIN_EMAIL/ADMIN_PASSWORD, etc.
```

### 3a. Opción Docker Compose

```bash
docker compose build
docker compose up -d
# Las migraciones se aplican solas al arrancar (docker-entrypoint.sh corre
# `prisma migrate deploy` antes de levantar el server).
docker compose exec app npx prisma db seed   # solo la primera vez, crea al admin
```

### 3b. Opción PM2 nativo

```bash
# Crea la DB y usuario en Postgres local si aún no existen
sudo -u postgres psql -c "CREATE USER contratas WITH PASSWORD 'cambia-esto';"
sudo -u postgres psql -c "CREATE DATABASE contratas OWNER contratas;"

npm ci
npm run build          # prisma generate + migrate deploy + next build
npm run db:seed        # solo la primera vez, crea al admin

pm2 start ecosystem.config.js
pm2 save && pm2 startup   # para que arranque solo tras reiniciar el VPS
```

### 4. Nginx + SSL

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/kredired
# Ya trae server_name kredired.cloud — solo revisa que apunte
# a tu dominio si en algún momento cambia.
sudo ln -s /etc/nginx/sites-available/kredired /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kredired.cloud
```

### 5. Tareas programadas (recordatorio diario + corte de caja mensual)

Usamos el crontab del sistema del VPS para disparar el recordatorio diario
y el cierre mensual del estado de resultados (último día del mes):

```bash
crontab -e
# pega el contenido de deploy/crontab.example, ajustando dominio y CRON_SECRET
```

### 6. Actualizar tras cambios de código

```bash
git pull
# Docker Compose:
docker compose build && docker compose up -d
# PM2:
npm ci && npm run build && pm2 restart kredired
```

### Checklist VPS

- [ ] Node 20 + Nginx + certbot instalados
- [ ] `.env` configurado (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` con dominio real)
- [ ] App arriba (Docker Compose o PM2) y respondiendo en `127.0.0.1:3000`
- [ ] Nginx como reverse proxy + SSL con certbot
- [ ] Seed del admin ejecutado
- [ ] Crontab del recordatorio diario y del corte de caja mensual instalado (`deploy/crontab.example`)
- [ ] `pm2 startup` / `docker compose` con `restart: unless-stopped` para sobrevivir reinicios del VPS

## Deploy automático (CI/CD)

`.github/workflows/deploy.yml` corre en cada push a `main`: se conecta al VPS
por SSH, hace `git reset --hard origin/main`, reconstruye la imagen Docker y
reinicia el contenedor. Las migraciones de Prisma se aplican solas en el
entrypoint — no hace falta ningún paso manual.

Requiere estos secrets en el repo de GitHub (Settings → Secrets and
variables → Actions), ya configurados para este VPS:

- `VPS_HOST` — IP del servidor
- `VPS_USER` — usuario de deploy (no root)
- `VPS_SSH_KEY` — llave privada dedicada solo para CI/CD (distinta de tu
  llave personal; su llave pública está en `~deploy/.ssh/authorized_keys`
  del VPS)

Si el pipeline falla o necesitas forzar un redeploy sin pushear código, usa
`deploy/deploy.sh` (ver abajo).

## Scripts de automatización (`deploy/`)

Todos asumen que ya tienes acceso SSH por llave al VPS (`deploy@<IP>`, sin
contraseña). Edita la IP/usuario al inicio del script si cambian.

- **`deploy/deploy.sh`** — deploy manual (lo mismo que hace el CI/CD): git
  reset + rebuild + restart. Útil para forzar un redeploy o depurar un
  fallo del pipeline.
- **`deploy/logs.sh [servicio]`** — logs en vivo del VPS (`app` por
  defecto, o `db` para Postgres).
- **`deploy/backup-db.sh`** — descarga un respaldo (`pg_dump`) de la base de
  producción a tu máquina, con fecha en el nombre. Los `.dump` están en
  `.gitignore` — bórralos cuando ya no los necesites.
- **`deploy/db-tunnel.sh`** — abre un túnel SSH para conectar tu IDE/cliente
  SQL local (TablePlus, DataGrip, DBeaver, `psql`) a la base de producción
  sin exponerla a internet: Postgres solo escucha en el loopback del VPS
  (`docker-compose.override.yml`, no versionado, solo existe ahí). Conecta
  tu cliente a `localhost:5433` con las credenciales de `.env` del VPS
  mientras el túnel esté abierto.

## Monitor de operaciones (/monitor)

Panel web interno (errores, actividad, usuarios y métricas de toda la
plataforma). Entra con una cuenta normal de Kredired que tenga
`User.accesoMonitor = true`; cualquier otra recibe 404.

Otorgar acceso en producción (después del deploy que trae la migración):

```bash
ssh deploy@187.127.248.213 "cd ~/kredired && sudo docker compose exec -T db psql -U contratas contratas -c \"UPDATE \\\"User\\\" SET \\\"accesoMonitor\\\" = true WHERE email = 'CORREO_O_TELEFONO';\""
```

En local: `npx tsx scripts/acceso-monitor.ts <correo>` (`--quitar` para revocar).

## WhatsApp automático (worker)

El worker de WhatsApp es un servicio aparte con perfil `whatsapp` en `docker-compose.yml`: el deploy normal no lo levanta ni lo reinicia. Necesita `WHATSAPP_SESSION_KEY` en `.env`. Puesta en marcha, actualización y emergencias: ver `docs/whatsapp.md` (sección 13).
