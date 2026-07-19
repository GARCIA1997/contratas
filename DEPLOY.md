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
# NEXTAUTH_URL="https://kredired.spartans-dev.io", ADMIN_EMAIL/ADMIN_PASSWORD, etc.
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
# Ya trae server_name kredired.spartans-dev.io — solo revisa que apunte
# a tu dominio si en algún momento cambia.
sudo ln -s /etc/nginx/sites-available/kredired /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kredired.spartans-dev.io
```

### 5. Recordatorio diario

Usamos el crontab del sistema del VPS para disparar el recordatorio diario:

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
- [ ] Crontab del recordatorio diario instalado (`deploy/crontab.example`)
- [ ] `pm2 startup` / `docker compose` con `restart: unless-stopped` para sobrevivir reinicios del VPS
