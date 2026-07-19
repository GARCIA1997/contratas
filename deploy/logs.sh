#!/bin/bash
# Muestra los logs en vivo de la app en producción.
#
# Uso: ./deploy/logs.sh          (últimas 100 líneas + sigue en vivo)
#      ./deploy/logs.sh db       (logs de Postgres en vez de la app)

set -euo pipefail

VPS_HOST="187.127.248.213"
VPS_USER="deploy"
SERVICIO="${1:-app}"

ssh -t "${VPS_USER}@${VPS_HOST}" "cd ~/kredired && sudo docker compose logs -f --tail=100 ${SERVICIO}"
