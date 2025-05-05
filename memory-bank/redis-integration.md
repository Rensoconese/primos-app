# Integración de Redis en Primos CheckIn

## Descripción General

La integración de Redis (Upstash) en Primos CheckIn se ha implementado para gestionar el bloqueo global de NFTs después del check-in diario. Este sistema garantiza que un NFT solo pueda ser utilizado una vez por día en el sistema de check-in, independientemente de la wallet que lo posea.

## Objetivos

1. **Bloqueo Global de NFTs**: Prevenir que un NFT sea utilizado más de una vez por día en el sistema de check-in
2. **Sincronización con Tiempo UTC**: Alinear el sistema de bloqueo con el mismo estándar de tiempo UTC utilizado en el check-in
3. **Desbloqueo Automático**: Permitir que los NFTs se desbloqueen automáticamente a medianoche UTC
4. **Mejora de Performance**: Reducir la carga en Supabase y mejorar los tiempos de respuesta

## Implementación

### Servicio Redis (`redisService.ts`)

El servicio `redisService.ts` centraliza toda la lógica relacionada con Redis:

```typescript
// Inicializar cliente Redis desde variables de entorno
export const getRedisUrl = () => {
  return process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL || 
         process.env.UPSTASH_REDIS_REST_URL || 
         process.env.NEXT_PUBLIC_KV_REST_API_URL ||
         process.env.KV_REST_API_URL || 
         '';
};

export const getRedisToken = () => {
  return process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN || 
         process.env.UPSTASH_REDIS_REST_TOKEN || 
         process.env.NEXT_PUBLIC_KV_REST_API_TOKEN ||
         process.env.KV_REST_API_TOKEN || 
         '';
};

const redis = new Redis({
  url: getRedisUrl(),
  token: getRedisToken(),
});

// Prefijo para las claves de NFTs bloqueados
const NFT_KEY_PREFIX = 'nft:locked:';

/**
 * Calcula el tiempo hasta el próximo reset de día UTC (medianoche)
 * @returns Segundos hasta medianoche UTC
 */
export function calculateNextUTCReset(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  
  // Devuelve TTL en segundos
  return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
}

/**
 * Bloquea un NFT hasta el próximo reset de día UTC
 * @returns true si se bloqueó correctamente, false si ya estaba bloqueado
 */
export async function lockNFT(contractAddress: string, tokenId: string, walletAddress: string): Promise<boolean> {
  const key = getNFTKey(contractAddress, tokenId);
  const ttl = calculateNextUTCReset();
  
  // Almacenar la wallet que bloqueó el NFT
  const result = await redis.set(key, walletAddress.toLowerCase(), { 
    nx: true, // Solo establecer si no existe
    ex: ttl    // Expirar automáticamente en el próximo reset UTC
  });
  
  return result === 'OK';
}

/**
 * Verifica si un NFT está bloqueado
 * @returns true si está bloqueado, false si no
 */
export async function isNFTLocked(contractAddress: string, tokenId: string): Promise<boolean> {
  try {
    const lockInfo = await getNFTLockInfo(contractAddress, tokenId);
    const isLocked = lockInfo !== null;
    console.log(`Verificando bloqueo de NFT ${contractAddress}:${tokenId} - Bloqueado: ${isLocked}`);
    return isLocked;
  } catch (error) {
    console.error(`Error verificando bloqueo de NFT ${contractAddress}:${tokenId}:`, error);
    // En caso de error, asumimos que no está bloqueado para permitir su uso
    return false;
  }
}
```

### Modificación de `calculateNFTPoints` en `nftService.ts`

La función `calculateNFTPoints` se ha modificado para aceptar un parámetro `blockNFTs` que determina si los NFTs deben ser bloqueados o no:

```typescript
export async function calculateNFTPoints(walletAddress: string, blockNFTs: boolean = false) {
  try {
    // ...
    
    // Verificar cada NFT SOLO en Redis
    for (const nft of nfts || []) {
      // Verificar en Redis si el NFT está bloqueado
      const isLocked = await isNFTLocked(nft.contract_address, nft.token_id);
      
      if (!isLocked) {
        // Si no está bloqueado, lo añadimos a los elegibles
        eligibleNfts.push(nft);
        totalPoints += (nft.bonus_points || 0);
        
        // Bloqueamos el NFT para este wallet solo si blockNFTs es true
        if (blockNFTs) {
          const lockResult = await lockNFT(nft.contract_address, nft.token_id, walletAddress);
          console.log(`NFT ${nft.contract_address}:${nft.token_id} ${lockResult ? 'bloqueado' : 'no se pudo bloquear'} para wallet ${walletAddress}`);
        }
      } else {
        console.log(`NFT ${nft.contract_address}:${nft.token_id} ya está bloqueado, no disponible para wallet ${walletAddress}`);
      }
    }
    
    // ...
  }
}
```

### Endpoints de Gestión de Redis

Se han creado dos endpoints para facilitar la gestión de Redis:

1. **Endpoint para Estadísticas de NFTs Bloqueados** (`/api/redis-stats`):
   ```typescript
   export async function GET(req: NextRequest) {
     try {
       // Obtener estadísticas generales
       const stats = await getNFTLockStats();
       
       // Obtener wallet de la query si existe
       const url = new URL(req.url);
       const wallet = url.searchParams.get('wallet');
       
       let walletNFTs = null;
       if (wallet) {
         walletNFTs = await getLockedNFTsByWallet(wallet);
       }
       
       return NextResponse.json({ 
         success: true, 
         stats,
         walletNFTs
       });
     } catch (error) {
       // Manejo de errores...
     }
   }
   ```

2. **Endpoint para Limpiar NFTs Bloqueados** (`/api/redis-clear`):
   ```typescript
   export async function POST(req: NextRequest) {
     try {
       // Inicializar cliente Redis
       const redis = new Redis({
         url: getRedisUrl(),
         token: getRedisToken(),
       });
       
       // Obtener todas las claves que coinciden con el patrón de NFTs bloqueados
       const keys = await redis.keys('nft:locked:*');
       
       // Eliminar todas las claves encontradas
       let deletedCount = 0;
       for (const key of keys) {
         const result = await redis.del(key);
         if (result === 1) {
           deletedCount++;
         }
       }
       
       return NextResponse.json({ 
         success: true, 
         message: `Se han limpiado ${deletedCount} NFTs bloqueados`,
         keysDeleted: deletedCount,
         totalKeys: keys.length
       });
     } catch (error) {
       // Manejo de errores...
     }
   }
   ```

## Flujo de Bloqueo de NFTs

1. **Verificación Inicial**: Cuando un usuario conecta su wallet, la aplicación verifica qué NFTs están disponibles (no bloqueados) utilizando `calculateNFTPoints(walletAddress, false)`.
2. **Check-in**: Cuando el usuario hace check-in, la aplicación calcula los puntos y bloquea los NFTs utilizados con `calculateNFTPoints(walletAddress, true)`.
3. **Bloqueo Global**: Los NFTs bloqueados no pueden ser utilizados por ninguna wallet hasta que expire el TTL.
4. **Desbloqueo Automático**: A medianoche UTC, Redis elimina automáticamente las claves expiradas, desbloqueando los NFTs.

## Variables de Entorno Requeridas

```
# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
NEXT_PUBLIC_UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN=your-token
```

## Consideraciones y Mejores Prácticas

1. **Manejo de Errores**: En caso de error al verificar si un NFT está bloqueado, se asume que no está bloqueado para permitir su uso.
2. **Tiempo de Expiración**: El tiempo de expiración se calcula dinámicamente hasta la medianoche UTC.
3. **Prefijo de Claves**: Se utiliza un prefijo (`nft:locked:`) para todas las claves relacionadas con NFTs bloqueados.
4. **Monitoreo**: Se recomienda monitorear el número de NFTs bloqueados y el tiempo hasta el próximo reset.

## Ventajas de la Solución

1. **Rendimiento**: Redis ofrece tiempos de respuesta más rápidos que Supabase para operaciones de bloqueo.
2. **Desbloqueo Automático**: El mecanismo de TTL de Redis permite desbloquear automáticamente los NFTs sin necesidad de un job programado.
3. **Consistencia**: El sistema garantiza que un NFT solo pueda ser utilizado una vez por día, independientemente de la wallet.
4. **Simplicidad**: La implementación es sencilla y fácil de mantener.

## Limitaciones y Consideraciones Futuras

1. **Dependencia Externa**: El sistema depende de Upstash Redis, lo que añade una dependencia externa.
2. **Manejo de Fallos**: En caso de fallos en Redis, se podría implementar un sistema de fallback con Supabase.
3. **Escalabilidad**: Para un número muy grande de NFTs, se podría considerar una estrategia de sharding.
4. **Monitoreo Avanzado**: Implementar un sistema de alertas para detectar anomalías en el bloqueo de NFTs.
