#!/bin/bash
# Deploy manual a producción — normalmente no hace falta correrlo: el
# workflow de GitHub Actions (.github/workflows/deploy.yml) ya redespliega
# solo en cada push a main. Este script es para cuando necesitas forzar un
# redeploy sin hacer un push (p. ej. la imagen base de Docker cambió, o
# quieres reintentar tras un fallo del pipeline).
#
# Uso: ./deploy/deploy.sh

set -euo pipefail

VPS_HOST="187.127.248.213"
VPS_USER="deploy"

ssh "${VPS_USER}@${VPS_HOST}" '
  set -e
  cd ~/kredired
  git fetch origin
  git reset --hard origin/main
  sudo docker compose build app
  sudo docker compose up -d
  sudo docker image prune -f
  echo "--- estado ---"
  sudo docker compose ps
'
