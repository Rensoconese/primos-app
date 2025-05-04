#!/bin/bash

# Script para verificar la estructura del proyecto y detectar problemas comunes
# que pueden causar fallos de despliegue en Vercel

echo "=== Verificando estructura del proyecto ==="
echo ""

# Comprobar si hay una estructura duplicada
echo "Comprobando estructura duplicada..."
if [ -d "Primos_CheckIn" ]; then
  echo "⚠️  ADVERTENCIA: Se encontró una carpeta Primos_CheckIn que duplica el proyecto."
  echo "    Esto puede confundir a Vercel durante el despliegue."
  echo "    Recomendación: Eliminar esta carpeta o excluirla del despliegue."
else
  echo "✅ No se encontró estructura duplicada."
fi
echo ""

# Comprobar archivos críticos
echo "Comprobando archivos críticos..."
critical_files=("package.json" "next.config.ts" "src/app/page.tsx" "tsconfig.json")
for file in "${critical_files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ Archivo $file encontrado."
  else
    echo "❌ ERROR: No se encontró el archivo $file, que es necesario para el despliegue."
  fi
done
echo ""

# Comprobar la existencia de .env.local
echo "Comprobando archivos de entorno..."
if [ -f ".env.local" ]; then
  echo "ℹ️  Se encontró .env.local - Este archivo NO se incluirá en el despliegue."
  echo "    Asegúrate de configurar estas variables en el panel de Vercel."
else
  echo "ℹ️  No se encontró .env.local - Esto no es un problema si las variables"
  echo "    de entorno ya están configuradas en Vercel."
fi
echo ""

# Comprobar tamaño del proyecto
echo "Comprobando tamaño del proyecto..."
if [ -d "node_modules" ]; then
  size=$(du -sh . --exclude=node_modules | cut -f1)
  echo "📊 Tamaño del proyecto (sin node_modules): $size"
else
  size=$(du -sh . | cut -f1)
  echo "📊 Tamaño del proyecto: $size"
fi
echo ""

# Comprobar versiones de React y Next.js
echo "Comprobando versiones de React y Next.js..."
if [ -f "package.json" ]; then
  next_version=$(grep -o '"next": "[^"]*"' package.json | cut -d'"' -f4)
  react_version=$(grep -o '"react": "[^"]*"' package.json | cut -d'"' -f4)
  
  echo "📦 Next.js: $next_version"
  echo "📦 React: $react_version"
  
  if [[ "$next_version" == *"15."* ]] || [[ "$react_version" == *"19."* ]]; then
    echo "⚠️  ADVERTENCIA: Estás usando versiones muy recientes de Next.js/React que pueden"
    echo "    causar problemas de compatibilidad con Vercel. Considera usar versiones estables:"
    echo "    - Next.js: 14.x.x"
    echo "    - React: 18.x.x"
  else
    echo "✅ Las versiones de Next.js y React parecen compatibles con Vercel."
  fi
else
  echo "❌ No se pudo verificar las versiones de Next.js y React (package.json no encontrado)."
fi
echo ""

echo "=== Recomendaciones finales ==="
echo "1. Actualiza tu package.json usando el archivo updated_package.json."
echo "2. Actualiza tu next.config.ts usando el archivo updated_next.config.ts."
echo "3. Actualiza tu .nowignore usando el archivo updated_nowignore."
echo "4. Configura tus variables de entorno en el panel de Vercel."
echo "5. Elimina la carpeta Primos_CheckIn si no es necesaria."
echo ""
echo "Sigue las instrucciones detalladas en Vercel_Deployment_Guide.md"
