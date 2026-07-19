#!/bin/bash
# Baja un respaldo (pg_dump, formato custom) de la base de datos de
# producción a tu Mac, con fecha en el nombre de archivo. Los .dump se
# ignoran en git (contienen datos reales/sensibles) — bórralos cuando ya
# no los necesites.
#
# Uso: ./deploy/backup-db.sh

set -euo pipefail

VPS_HOST="187.127.248.213"
VPS_USER="deploy"
FECHA=$(date +%Y-%m-%d_%H%M)
ARCHIVO="kredired-backup-${FECHA}.dump"

echo "Generando respaldo en el VPS..."
ssh "${VPS_USER}@${VPS_HOST}" "cd ~/kredired && sudo docker compose exec -T db pg_dump -U contratas -Fc contratas" > "${ARCHIVO}"

echo "Respaldo guardado en: $(pwd)/${ARCHIVO} ($(du -h "${ARCHIVO}" | cut -f1))"
