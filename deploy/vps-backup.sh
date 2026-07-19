#!/bin/bash
# Respaldo automático de la base de datos, pensado para correr EN el VPS vía
# cron (distinto de deploy/backup-db.sh, que baja un dump a tu Mac).
#
# Genera un pg_dump comprimido con fecha, en ~/kredired-backups (fuera del
# repo, para que `git reset --hard` del deploy no lo toque), y conserva solo
# los últimos RETENER días.
#
# Instalación del cron (una sola vez, en el VPS):
#   crontab -e
#   # Respaldo diario a las 03:00 hora de México (09:00 UTC):
#   0 9 * * * ~/kredired/deploy/vps-backup.sh >> ~/kredired-backups/backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${HOME}/kredired-backups"
RETENER=7
FECHA=$(date +%Y-%m-%d_%H%M%S)
ARCHIVO="${BACKUP_DIR}/kredired-${FECHA}.dump"
PROYECTO="${HOME}/kredired"

mkdir -p "${BACKUP_DIR}"

# pg_dump en formato custom (comprimido) desde el contenedor de Postgres.
cd "${PROYECTO}"
sudo docker compose exec -T db pg_dump -U contratas -Fc contratas > "${ARCHIVO}"

# Descarta el archivo si quedó vacío (fallo silencioso) para no rotar y
# perder respaldos buenos por uno malo.
if [ ! -s "${ARCHIVO}" ]; then
  echo "$(date '+%F %T') ERROR: dump vacío, se descarta ${ARCHIVO}"
  rm -f "${ARCHIVO}"
  exit 1
fi

TAM=$(du -h "${ARCHIVO}" | cut -f1)
echo "$(date '+%F %T') OK: ${ARCHIVO} (${TAM})"

# Rotación: borra los respaldos con más de RETENER días.
find "${BACKUP_DIR}" -name "kredired-*.dump" -type f -mtime "+${RETENER}" -delete
