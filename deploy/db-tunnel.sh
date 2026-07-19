#!/bin/bash
# Abre un túnel SSH para conectar un IDE/cliente SQL local (TablePlus,
# DataGrip, DBeaver, psql...) al Postgres de producción sin exponerlo a
# internet. Postgres solo escucha en 127.0.0.1 del VPS (ver
# docker-compose.override.yml en el VPS, no versionado); este túnel expone
# ese mismo puerto en tu Mac bajo un puerto distinto para no chocar con tu
# Postgres local.
#
# Uso: ./deploy/db-tunnel.sh
# Deja la terminal abierta mientras uses la conexión; Ctrl+C para cerrar.

set -euo pipefail

VPS_HOST="187.127.248.213"
VPS_USER="deploy"
LOCAL_PORT="5433"

echo "Túnel abierto: localhost:${LOCAL_PORT} → ${VPS_HOST}:5432 (Postgres de producción)"
echo "Conecta tu IDE con host=localhost puerto=${LOCAL_PORT} y las credenciales de .env del VPS."
echo "Ctrl+C para cerrar."
ssh -N -L "${LOCAL_PORT}:127.0.0.1:5432" "${VPS_USER}@${VPS_HOST}"
