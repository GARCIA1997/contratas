#!/bin/sh
set -e

# Aplica migraciones pendientes contra la DB real antes de arrancar el server.
# Se corre aquí (runtime) y no en el build de la imagen, porque en el build
# la base de datos todavía no está disponible.
# Se invoca el CLI directamente con node (en vez de `npx prisma`) porque la
# imagen runner no trae el symlink node_modules/.bin/prisma.
node node_modules/prisma/build/index.js migrate deploy

exec "$@"
