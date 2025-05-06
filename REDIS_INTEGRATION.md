# Integración de Redis (Upstash) en Primos CheckIn

Este documento describe la integración de Redis (Upstash) para el manejo del bloqueo global de NFTs en el sistema Primos CheckIn.

## Descripción General

La integración de Redis (Upstash) permite mejorar el rendimiento y la consistencia del sistema de bloqueo de NFTs después del check-in. Los NFTs se bloquean globalmente hasta el próximo reset de día UTC, y se desbloquean automáticamente cuando se habilita el nuevo check-in diario.

## Configuración

### 1. Variables de Entorno

Añade las siguientes variables de entorno en tu archivo `.env.local`:

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Puedes obtener estos valores desde la consola de Upstash después de crear una base de datos Redis.

### 2. Instalación de Dependencias

```bash
npm install @upstash/redis
```

## Estructura de la Implementación

### Servicio Redis

El servicio Redis está implementado en `src/services/redisService.ts` y proporciona las siguientes funcionalidades:

- **lockNFT**: Bloquea un NFT hasta el próximo reset de día UTC
- **isNFTLocked**: Verifica si un NFT está bloqueado
- **getNFTLockInfo**: Obtiene información sobre quién bloqueó un NFT
- **unlockNFT**: Desbloquea un NFT específico
- **getLockedNFTsByWallet**: Obtiene todos los NFTs bloqueados por una wallet
- **calculateNextUTCReset**: Calcula el tiempo hasta el próximo reset de día UTC
- **getNFTLockStats**: Obtiene estadísticas sobre NFTs bloqueados
- **testConnection**: Verifica la conexión con Redis

### Integración con el Servicio de NFTs

El servicio de NFTs (`src/services/nftService.ts`) ha sido modificado para utilizar Redis para el bloqueo de NFTs. La función `calculateNFTPoints` ahora verifica primero en Redis si un NFT está bloqueado antes de incluirlo en los cálculos.

### Endpoint de Prueba

Se ha creado un endpoint de prueba en `src/app/api/test-redis/route.ts` para verificar la conexión con Redis y obtener información sobre el próximo reset de día UTC.

## Funcionamiento

1. Cuando un usuario realiza un check-in, el sistema verifica los NFTs disponibles para ese usuario.
2. Para cada NFT, se verifica en Redis si ya está bloqueado globalmente.
3. Si el NFT no está bloqueado, se incluye en los cálculos de puntos y se bloquea en Redis con un TTL hasta el próximo reset de día UTC.
4. Los NFTs se desbloquean automáticamente cuando expira el TTL (a medianoche UTC).

## Migración Completa a Redis

Se ha eliminado la dependencia de Supabase para el bloqueo de NFTs, y ahora se utiliza exclusivamente Redis para esta funcionalidad. Esto mejora significativamente el rendimiento y la consistencia del sistema.

Los NFTs se bloquean en Redis cuando se utilizan en un check-in y se desbloquean automáticamente a medianoche UTC gracias al TTL configurado.

## Ventajas

- **Mayor rendimiento**: Las verificaciones de bloqueo son más rápidas con Redis que con consultas a Supabase.
- **Consistencia global**: El bloqueo de NFTs es consistente en toda la aplicación.
- **Desbloqueo automático**: Los NFTs se desbloquean automáticamente a medianoche UTC.
- **Reducción de costos de Supabase**: Menos consultas a la base de datos.

## Próximos Pasos

1. Implementar endpoints Hono para reemplazar las API Routes de Next.js.
2. Configurar middleware para redirigir solicitudes API a Hono.
3. Implementar monitoreo y métricas para el sistema de bloqueo de NFTs con Redis.

## Pruebas

Para probar la integración de Redis, puedes acceder al endpoint `/api/test-redis` que verificará la conexión con Redis y proporcionará información sobre el próximo reset de día UTC.

```bash
curl http://localhost:3000/api/test-redis
```

## Solución de Problemas

### Error de Conexión con Redis

Si recibes un error de conexión con Redis, verifica:

1. Que las variables de entorno `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` estén correctamente configuradas.
2. Que la base de datos Redis esté activa y accesible.
3. Que no haya restricciones de red que impidan la conexión.

### Inconsistencias en el Bloqueo de NFTs

Si observas inconsistencias en el bloqueo de NFTs:

1. Verifica que el cálculo del tiempo UTC sea consistente en toda la aplicación.
2. Comprueba que el TTL se esté calculando correctamente.
3. Verifica que no haya problemas de concurrencia en las operaciones de bloqueo.
