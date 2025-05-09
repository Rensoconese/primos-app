#!/bin/bash

# Script para corregir el leaderboard para la wallet del usuario
# Uso: ./dev-tools/fix-user-leaderboard.sh <wallet_address>

# Verificar si se proporcionó una dirección de wallet
if [ -z "$1" ]; then
  echo "Error: Se requiere una dirección de wallet"
  echo "Uso: ./dev-tools/fix-user-leaderboard.sh <wallet_address>"
  exit 1
fi

WALLET_ADDRESS=$1

# Verificar si el archivo .env existe
if [ ! -f .env.local ] && [ ! -f .env ]; then
  echo "Error: No se encontró un archivo .env o .env.local"
  exit 1
fi

# Instalar dependencias si es necesario
if ! npm list @supabase/supabase-js >/dev/null 2>&1; then
  echo "Instalando dependencias necesarias..."
  npm install --no-save @supabase/supabase-js dotenv
fi

# Ejecutar el script de corrección
echo "Corrigiendo leaderboard para wallet: $WALLET_ADDRESS"
node dev-tools/fix-leaderboard.js $WALLET_ADDRESS

echo ""
echo "Para verificar que la corrección se aplicó correctamente, puedes:"
echo "1. Recargar la página de la aplicación"
echo "2. Verificar el leaderboard en la base de datos con:"
echo "   SELECT * FROM leaderboard WHERE wallet_address = '$WALLET_ADDRESS';"
