#!/bin/bash

echo "=== Iniciando proceso de despliegue para Linux ==="

# Comprobar si existe un token de GitHub
if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: No se ha configurado el token de GitHub."
  echo "Por favor, ejecuta: export GH_TOKEN=tu_token_personal_aqui"
  exit 1
fi

echo "[1/4] Verificando dependencias necesarias..."
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js no está instalado o no está en el PATH."
  exit 1
fi

# Verificar si están instaladas las dependencias para crear paquetes Linux
if ! command -v fakeroot &> /dev/null || ! command -v dpkg &> /dev/null; then
  echo "ADVERTENCIA: fakeroot o dpkg no están instalados. Necesarios para crear paquetes .deb"
  echo "Intenta: sudo apt-get install fakeroot dpkg"
fi

if ! command -v rpm &> /dev/null; then
  echo "ADVERTENCIA: rpm no está instalado. Necesario para crear paquetes .rpm"
  echo "Intenta: sudo apt-get install rpm"
fi

echo "[2/4] Construyendo aplicación..."
npm run build
if [ $? -ne 0 ]; then
  echo "ERROR: Falló el proceso de construcción."
  exit 1
fi

echo "[3/4] Empaquetando para Linux (sin publicar)..."
npx electron-builder --linux --publish never
if [ $? -ne 0 ]; then
  echo "ERROR: Falló el proceso de empaquetado para Linux."
  exit 1
fi

echo "[4/4] Publicando en GitHub..."
npx electron-builder --linux --publish always
if [ $? -ne 0 ]; then
  echo "ERROR: Falló la publicación en GitHub."
  exit 1
fi

echo "=== Despliegue para Linux completado con éxito ==="
echo "Los archivos generados están en la carpeta 'release/'"
echo "Recuerda revocar o rotar el token de GitHub si ya no lo necesitas."