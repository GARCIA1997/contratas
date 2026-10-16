#!/bin/bash
# Reconstruye el worker de WhatsApp SOLO si cambió código que usa.
#
# Lo corre el deploy (deploy.yml / deploy.sh) en el VPS, dentro de
# ~/kredired, después de levantar la app. El worker no se reinicia en cada
# deploy a propósito (cada reconexión es una señal de riesgo para el
# número): solo cuando hace falta, que es justo cuando antes había que
# hacerlo a mano.
#
# Compara contra el commit con el que se construyó el worker la última vez
# (.worker-commit). Así también se pone al día si un deploy anterior lo
# dejó atrás. La lista de archivos sale de worker/whatsapp/huella.mjs, la
# misma que usa el monitor para avisar "worker desactualizado".
#
# Uso: ./deploy/actualizar-worker.sh [commit-anterior]
#   commit-anterior: el que estaba desplegado antes de este deploy; se usa
#   solo si todavía no existe .worker-commit.
set -euo pipefail
cd "$(dirname "$0")/.."

MARCA=.worker-commit
ACTUAL=$(git rev-parse HEAD)

if [ -z "$(sudo docker compose --profile whatsapp ps -q whatsapp 2>/dev/null)" ]; then
  echo "worker: no está levantado en este servidor, no se toca"
  exit 0
fi

BASE=$(cat "$MARCA" 2>/dev/null || echo "${1:-}")
RUTAS=$(sed -n '/ARCHIVOS_DEL_WORKER = \[/,/\];/p' worker/whatsapp/huella.mjs | grep -o '"[^"]*"' | tr -d '"')

if [ -n "$BASE" ] && git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  # Las pruebas no cuentan (huella.mjs tampoco las incluye).
  CAMBIOS=$(git diff --name-only "$BASE" "$ACTUAL" -- $RUTAS | grep -v '\.test\.ts$' || true)
else
  CAMBIOS="(sin referencia del último build)"
fi

if [ -z "$CAMBIOS" ]; then
  echo "worker: sin cambios en su código desde ${BASE:0:7}, no se reinicia"
  echo "$ACTUAL" > "$MARCA"
  exit 0
fi

echo "worker: cambió su código, se reconstruye:"
echo "$CAMBIOS" | sed 's/^/  /'
sudo docker compose --profile whatsapp build whatsapp
sudo docker compose --profile whatsapp up -d whatsapp
echo "$ACTUAL" > "$MARCA"
echo "worker: actualizado a ${ACTUAL:0:7}"
