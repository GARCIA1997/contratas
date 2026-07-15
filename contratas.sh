#!/bin/bash

echo "🚀 Iniciando Contratas con Docker + ngrok..."

# 1. Verificar que ngrok esté instalado
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok no está instalado. Instálalo con: brew install ngrok"
    exit 1
fi

# 2. Verificar que el token esté configurado en ngrok
NGROK_CONFIG="$HOME/Library/Application Support/ngrok/ngrok.yml"
if [ ! -f "$NGROK_CONFIG" ]; then
    echo "❌ Token de ngrok no configurado."
    echo "   Ejecuta: ngrok config add-authtoken TU_TOKEN"
    exit 1
fi

# 3. Detener containers previos si existen
echo "🛑 Deteniendo containers previos (si existen)..."
docker compose down 2>/dev/null || true

# 4. Levantar Docker Compose
echo "🐳 Levantando Docker Compose..."
docker compose up -d

# 5. Esperar a que PostgreSQL esté listo
echo "⏳ Esperando a que PostgreSQL esté listo..."
sleep 5

# 6. Esperar a que la app esté lista
echo "⏳ Esperando a que la app esté lista (http://localhost:3000)..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "✅ App lista!"
        break
    fi
    echo "   Intento $i/30..."
    sleep 2
done

# 7. Iniciar ngrok en background y capturar su PID
echo "🌐 Iniciando ngrok en background..."
ngrok http 3000 > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!
sleep 4

# 8. Extraer la URL de ngrok desde la API
NGROK_URL=""
for i in {1..10}; do
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"\(.*\)"/\1/')
    if [ ! -z "$NGROK_URL" ]; then
        break
    fi
    echo "   Esperando URL de ngrok... intento $i/10"
    sleep 1
done

if [ -z "$NGROK_URL" ]; then
    echo "⚠️  No se pudo extraer la URL de ngrok automáticamente."
    echo "   Revisa: http://localhost:4040"
    NGROK_URL="https://PENDIENTE.ngrok.io"
else
    echo "✅ URL de ngrok: $NGROK_URL"

    # 9. Actualizar .env con la URL de ngrok
    if grep -q "^NEXTAUTH_URL=" .env; then
        sed -i '' "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=\"${NGROK_URL}\"|" .env
        echo "✅ Actualizado .env con NEXTAUTH_URL=$NGROK_URL"

        # Reiniciar app para que cargue el nuevo NEXTAUTH_URL
        echo "🔄 Reiniciando app..."
        docker compose restart app
        sleep 3
    fi
fi

# 10. Mostrar resumen
clear
echo ""
echo "════════════════════════════════════════════════════"
echo "✅ Contratas está corriendo!"
echo "════════════════════════════════════════════════════"
echo ""
echo "📱 Local:         http://localhost:3000"
echo "🌐 Público:       $NGROK_URL"
echo "📊 Dashboard ngrok: http://localhost:4040"
echo ""
echo "📝 Credenciales:"
echo "   Usuario: 3131128425"
echo "   Contraseña: testtest"
echo ""
echo "🛑 Para detener todo:"
echo "   Ctrl+C aquí y luego: docker compose down"
echo "════════════════════════════════════════════════════"
echo ""

# 11. Esperar a que se cierre (si Ctrl+C se presiona)
wait $NGROK_PID
