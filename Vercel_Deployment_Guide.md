# Guía para solucionar problemas de despliegue en Vercel

Este documento contiene instrucciones paso a paso para solucionar los problemas de despliegue en Vercel para el proyecto Primos Check-In.

## 1. Resolver la estructura duplicada del proyecto

Actualmente hay una estructura duplicada en el proyecto: los mismos archivos aparecen tanto en la raíz como en una subcarpeta llamada `Primos_CheckIn/`. Esto puede confundir a Vercel durante el despliegue.

### Solución:
- Mantén solo una versión del proyecto (preferentemente la de la raíz)
- Elimina la carpeta duplicada `Primos_CheckIn/` o asegúrate de que no esté incluida en el repositorio de GitHub que estás desplegando

## 2. Configurar variables de entorno en Vercel

El proyecto utiliza varias variables de entorno que están definidas en `.env.local`, pero este archivo está excluido por `.nowignore` y Vercel no lo incluirá en el despliegue.

### Solución:
En el panel de Vercel, ve a tu proyecto y configura las siguientes variables de entorno (usando los valores de tu archivo .env.local):

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- REWARD_POOL_PRIVATE_KEY
- MORALIS_API_KEY
- MORALIS_NODE_API
- RONIN_RPC_URL
- RONIN_RPC_URL_BACKUP

Para hacer esto en Vercel:
1. Inicia sesión en tu cuenta de Vercel
2. Selecciona tu proyecto
3. Ve a "Settings" > "Environment Variables"
4. Agrega cada una de las variables anteriores
5. Haz clic en "Save" y vuelve a desplegar tu proyecto

## 3. Revisar dependencias en package.json

El archivo `package.json` muestra algunas dependencias que podrían causar problemas:

### Problemas:
- Está usando versiones muy recientes de React (19.0.0) y Next.js (15.2.3) que podrían tener problemas de compatibilidad con otras dependencias o con Vercel mismo.

### Solución:
Modifica tu `package.json` para usar versiones más estables:

```json
"dependencies": {
  "@sky-mavis/tanto-connect": "^0.0.11",
  "@sky-mavis/tanto-wagmi": "^0.0.6",
  "@supabase/ssr": "^0.6.1",
  "@supabase/supabase-js": "^2.49.1",
  "@types/lodash": "^4.17.16",
  "ethers": "^5.7.2",
  "lodash": "^4.17.21",
  "next": "14.1.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "wagmi": "^0.12.19",
  "zustand": "^5.0.3"
}
```

Después de modificar el `package.json`, ejecuta:
```
npm install
```

Y luego vuelve a hacer commit y push a GitHub para que Vercel pueda desplegar con las nuevas dependencias.

## 4. Revisar next.config.ts

El archivo `next.config.ts` tiene configuraciones que podrían estar causando problemas durante el despliegue.

### Modificaciones recomendadas:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Para Turbopack y Webpack, usar el directorio de salida estándar
  distDir: '.next',
  
  // Configurar ESLint
  eslint: {
    // Sólo ejecutar ESLint en estos directorios durante la compilación
    dirs: ['src/app', 'src/components', 'src/hooks', 'src/services', 'src/utils'],
    // No ignorar errores de ESLint durante la compilación para Vercel
    ignoreDuringBuilds: false,
  },
  
  // No ignorar errores de TypeScript durante la compilación
  typescript: {
    // Esto mostrará errores en el editor y también fallará la compilación si hay errores
    ignoreBuildErrors: false,
  },
  
  // Configurar entradas bajo demanda para el servidor de desarrollo de Next.js
  onDemandEntries: {
    // Se pueden especificar directorios excluidos adicionales aquí
    // Next.js ya maneja las exclusiones predeterminadas
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2,
  },
};

export default nextConfig;
```

## 5. Actualizar .nowignore

El archivo `.nowignore` podría estar excluyendo archivos necesarios para el despliegue.

### Contenido recomendado para .nowignore:

```
# Node modules
node_modules

# Build output
.next
out

# Logs
*.log

# Environment variables locales (se configurarán en Vercel)
.env
.env.local
.env.*.local
!.env.example
```

## 6. Verificar compatibilidad con Vercel

Asegúrate de que tu proyecto es compatible con Vercel:

1. Verifica que el punto de entrada principal de tu aplicación sea `src/app/page.tsx` (para Next.js App Router) o `pages/index.tsx` (para Pages Router)
2. Asegúrate de que tu proyecto incluya scripts de compilación adecuados en `package.json`
3. Si estás utilizando WebAssembly u otras características avanzadas, es posible que necesites configuraciones adicionales

## 7. Otros problemas comunes

Otros problemas que podrían estar afectando tu despliegue:

- **Límites de tamaño**: Vercel tiene límites de tamaño para despliegues. Asegúrate de que tu proyecto no exceda estos límites.
- **Errores en el código**: Errores de sintaxis o problemas en el código que no se detectan localmente pueden causar fallos en el despliegue.
- **Permisos de GitHub**: Asegúrate de que Vercel tenga los permisos correctos para acceder a tu repositorio.

## Cómo depurar problemas de despliegue

1. Ve a tu proyecto en Vercel
2. Navega a la pestaña "Deployments"
3. Haz clic en el despliegue fallido
4. Examina los registros de compilación para ver detalles específicos sobre el error
5. Utiliza estos detalles para identificar y solucionar el problema específico

Si después de seguir estos pasos sigues teniendo problemas, considera contactar al soporte de Vercel para obtener ayuda adicional.
