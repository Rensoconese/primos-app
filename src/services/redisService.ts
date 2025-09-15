import { Redis } from '@upstash/redis';

// Función para extraer URL y token de una URL completa (como REDIS_URL o KV_URL)
const extractCredentialsFromUrl = (url: string): { url: string; token: string } | null => {
  if (!url) return null;
  
  try {
    // Formato típico: rediss://default:TOKEN@hostname:port
    const match = url.match(/rediss:\/\/default:([^@]+)@([^:]+):(\d+)/);
    if (match) {
      const token = match[1];
      const hostname = match[2];
      
      // Retorna formato compatible con Upstash REST API
      return {
        url: `https://${hostname}`,
        token: token
      };
    }
  } catch (e) {
    console.error("Error parsing Redis URL:", e);
  }
  
  return null;
};

// Función para obtener la URL de Redis - SIMPLIFICADA
export const getRedisUrl = () => {
  // En el cliente, las variables deben ser NEXT_PUBLIC_
  const url = process.env.NEXT_PUBLIC_KV_REST_API_URL || process.env.KV_REST_API_URL;
  
  if (!url) {
    console.warn('[Redis] KV_REST_API_URL not found');
    return '';
  }
  
  return url.replace(/\/$/, ''); // Remove trailing slash
};

// Función para obtener el token de Redis - SIMPLIFICADA
export const getRedisToken = () => {
  // En el cliente, las variables deben ser NEXT_PUBLIC_
  const token = process.env.NEXT_PUBLIC_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
  
  if (!token) {
    console.warn('[Redis] KV_REST_API_TOKEN not found');
    return '';
  }
  
  return token;
};

// Lazy initialization of Redis client
let redis: Redis | null = null;
let redisAvailable = true; // Track if Redis is available
let redisInitialized = false; // Track if we already logged initialization

// Function to get or create Redis client
export const getRedisClient = (): Redis | null => {
  // If we've already determined Redis is not available, return null immediately
  if (!redisAvailable) return null;
  
  if (redis) return redis;
  
  const url = getRedisUrl();
  const token = getRedisToken();
  
  if (!url || !token) {
    redisAvailable = false;
    return null;
  }
  
  try {
    redis = new Redis({
      url: url,
      token: token,
    });
    
    // Only log once when first initialized
    if (!redisInitialized) {
      console.log('Redis client initialized');
      redisInitialized = true;
    }
    return redis;
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    redisAvailable = false;
    return null;
  }
};

// Prefijo para las claves de NFTs bloqueados
const NFT_KEY_PREFIX = 'nft:locked:';

import { getSecondsUntilNextUTCMidnight, getUTCDebugInfo } from './dateService';

/**
 * Genera la clave Redis para un NFT
 */
function getNFTKey(contractAddress: string, tokenId: string): string {
  return `${NFT_KEY_PREFIX}${contractAddress.toLowerCase()}:${tokenId}`;
}

/**
 * Bloquea un NFT hasta el próximo reset de día UTC
 * @returns true si se bloqueó correctamente, false si ya estaba bloqueado
 */
export async function lockNFT(contractAddress: string, tokenId: string, walletAddress: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot lock NFT');
    return false;
  }
  
  try {
    const key = getNFTKey(contractAddress, tokenId);
    const ttl = getSecondsUntilNextUTCMidnight();
    
    // Almacenar la wallet que bloqueó el NFT
    const result = await client.set(key, walletAddress.toLowerCase(), { 
      nx: true, // Solo establecer si no existe
      ex: ttl    // Expirar automáticamente en el próximo reset UTC
    });
    
    return result === 'OK';
  } catch (error) {
    console.error('Error locking NFT:', error);
    // Mark Redis as unavailable if we get a network error
    if (error instanceof Error && error.message.includes('fetch failed')) {
      redisAvailable = false;
      // Silently mark as unavailable
    }
    return false;
  }
}

/**
 * Verifica si un NFT está bloqueado
 * @returns La dirección de wallet que bloqueó el NFT, o null si no está bloqueado
 */
export async function getNFTLockInfo(contractAddress: string, tokenId: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot get NFT lock info');
    return null;
  }
  
  try {
    const key = getNFTKey(contractAddress, tokenId);
    return await client.get(key);
  } catch (error) {
    console.error('Error getting NFT lock info:', error);
    // Mark Redis as unavailable if we get a network error
    if (error instanceof Error && error.message.includes('fetch failed')) {
      redisAvailable = false;
      // Silently mark as unavailable
    }
    return null;
  }
}

/**
 * Verifica si un NFT está bloqueado
 * @returns true si está bloqueado, false si no
 */
export async function isNFTLocked(contractAddress: string, tokenId: string): Promise<boolean> {
  try {
    const lockInfo = await getNFTLockInfo(contractAddress, tokenId);
    const isLocked = lockInfo !== null;
    // Only log in development to reduce noise
    if (process.env.NODE_ENV === 'development') {
      console.log(`Verificando bloqueo de NFT ${contractAddress}:${tokenId} - Bloqueado: ${isLocked}`);
    }
    return isLocked;
  } catch (error) {
    console.error(`🚨 ERROR verificando bloqueo de NFT ${contractAddress}:${tokenId}:`, error);
    // IMPORTANTE: En caso de error, retornamos false pero logeamos claramente
    // Esto podría estar causando que NFTs bloqueados se marquen como disponibles
    console.error(`⚠️  NFT ${tokenId} - ASUMIENDO NO BLOQUEADO POR ERROR - Esto podría ser el problema!`);
    console.error(`⚠️  Redis no disponible o error de conexión - todos los NFTs parecerán disponibles`);
    return false;
  }
}

/**
 * Desbloquea un NFT específico
 * @returns true si se desbloqueó correctamente, false si no estaba bloqueado
 */
export async function unlockNFT(contractAddress: string, tokenId: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot unlock NFT');
    return false;
  }
  
  try {
    const key = getNFTKey(contractAddress, tokenId);
    const result = await client.del(key);
    return result === 1;
  } catch (error) {
    console.error('Error unlocking NFT:', error);
    // Mark Redis as unavailable if we get a network error
    if (error instanceof Error && error.message.includes('fetch failed')) {
      redisAvailable = false;
      // Silently mark as unavailable
    }
    return false;
  }
}

/**
 * Obtiene todos los NFTs bloqueados por una wallet específica
 * @returns Array de objetos {contractAddress, tokenId}
 */
export async function getLockedNFTsByWallet(walletAddress: string): Promise<Array<{contractAddress: string, tokenId: string}>> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot get locked NFTs by wallet');
    return [];
  }
  
  try {
    // Obtener todas las claves que coinciden con el patrón
    const keys = await client.keys(`${NFT_KEY_PREFIX}*`);
    const lockedNFTs = [];
    
    // Verificar cada clave para ver si está bloqueada por esta wallet
    for (const key of keys) {
      const lockingWallet = await client.get(key);
      if (lockingWallet === walletAddress.toLowerCase()) {
        // Extraer contractAddress y tokenId de la clave
        const keyParts = key.split(':');
        // El formato es 'nft:locked:contractAddress:tokenId'
        if (keyParts.length >= 4) {
          const contractAddress = keyParts[2];
          const tokenId = keyParts[3];
          lockedNFTs.push({ contractAddress, tokenId });
        }
      }
    }
    
    return lockedNFTs;
  } catch (error) {
    console.error('Error getting locked NFTs by wallet:', error);
    // Mark Redis as unavailable if we get a network error
    if (error instanceof Error && error.message.includes('fetch failed')) {
      redisAvailable = false;
      // Silently mark as unavailable
    }
    return [];
  }
}

/**
 * Obtiene estadísticas sobre NFTs bloqueados
 */
export async function getNFTLockStats(): Promise<{
  totalLocked: number,
  byWallet: Record<string, number>
}> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot get NFT lock stats');
    return { totalLocked: 0, byWallet: {} };
  }
  
  try {
    const keys = await client.keys(`${NFT_KEY_PREFIX}*`);
    const walletCounts: Record<string, number> = {};
    
    for (const key of keys) {
      const wallet = await client.get(key);
      if (wallet && typeof wallet === 'string') {
        walletCounts[wallet] = (walletCounts[wallet] || 0) + 1;
      }
    }
    
    return {
      totalLocked: keys.length,
      byWallet: walletCounts
    };
  } catch (error) {
    console.error('Error getting NFT lock stats:', error);
    // Mark Redis as unavailable if we get a network error
    if (error instanceof Error && error.message.includes('fetch failed')) {
      redisAvailable = false;
      // Silently mark as unavailable
    }
    return { totalLocked: 0, byWallet: {} };
  }
}

/**
 * Verifica la conexión con Redis
 * @returns true si la conexión es exitosa, false si no
 */
export async function testConnection(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available for connection test');
    return false;
  }
  
  try {
    console.log('[Redis Debug] Testing connection with ping...');
    await client.ping();
    console.log('[Redis Debug] Redis ping successful!');
    redisAvailable = true;
    return true;
  } catch (error) {
    console.error('[Redis Debug] Error connecting to Redis:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('[Redis Debug] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        cause: (error as any).cause
      });
      
      // Check for specific error types
      if (error.message.includes('fetch failed')) {
        console.error('[Redis Debug] Network error - possible causes:');
        console.error('  - Firewall blocking connection to Upstash');
        console.error('  - No internet connection');
        console.error('  - Proxy configuration issues');
        redisAvailable = false;
      } else if (error.message.includes('Unauthorized')) {
        console.error('[Redis Debug] Authentication error - check your token');
        redisAvailable = false;
      }
    }
    return false;
  }
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Reset Redis availability (useful for retrying after fixing configuration)
 */
export function resetRedisAvailability(): void {
  redisAvailable = true;
  redis = null; // Clear the client to force recreation
  console.log('Redis availability reset - will retry on next operation');
}

// ============= V2 FUNCTIONS WITH SEPARATE NAMESPACE =============

/**
 * Genera la clave Redis para un NFT en V2
 */
function getNFTKeyV2(contractAddress: string, tokenId: string): string {
  return `v2:nft:locked:${contractAddress.toLowerCase()}:${tokenId}`;
}

/**
 * V2: Bloquea un NFT hasta el próximo reset de día UTC
 * @returns true si se bloqueó correctamente, false si ya estaba bloqueado
 */
export async function lockNFTV2(contractAddress: string, tokenId: string, walletAddress: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot lock NFT (v2)');
    return false;
  }
  
  try {
    const key = getNFTKeyV2(contractAddress, tokenId);
    const ttl = getSecondsUntilNextUTCMidnight();
    
    // Almacenar la wallet que bloqueó el NFT
    const result = await client.set(key, walletAddress.toLowerCase(), { 
      nx: true, // Solo establecer si no existe
      ex: ttl    // Expirar automáticamente en el próximo reset UTC
    });
    
    console.log(`V2: Locked NFT ${tokenId} for wallet ${walletAddress}`);
    return result === 'OK';
  } catch (error) {
    console.error('Error locking NFT (v2):', error);
    if (error instanceof Error && error.message.includes('fetch failed')) {
      redisAvailable = false;
      // Silently mark as unavailable
    }
    return false;
  }
}

/**
 * V2: Verifica si un NFT está bloqueado
 * @returns true si está bloqueado, false si no
 */
export async function isNFTLockedV2(contractAddress: string, tokenId: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot check NFT lock (v2)');
    return false;
  }
  
  try {
    const key = getNFTKeyV2(contractAddress, tokenId);
    const lockInfo = await client.get(key);
    const isLocked = lockInfo !== null;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`V2: Checking lock for NFT ${contractAddress}:${tokenId} - Locked: ${isLocked}`);
    }
    return isLocked;
  } catch (error) {
    console.error(`V2: Error checking NFT lock ${contractAddress}:${tokenId}:`, error);
    return false;
  }
}

/**
 * V2: Obtiene información sobre el bloqueo de un NFT
 * @returns La dirección de wallet que bloqueó el NFT, o null si no está bloqueado
 */
export async function getNFTLockInfoV2(contractAddress: string, tokenId: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) {
    console.warn('Redis not available, cannot get NFT lock info (v2)');
    return null;
  }
  
  try {
    const key = getNFTKeyV2(contractAddress, tokenId);
    return await client.get(key);
  } catch (error) {
    console.error('Error getting NFT lock info (v2):', error);
    return null;
  }
}

/**
 * V2 BATCH: Check multiple NFTs lock status in a single operation
 * @returns Map of tokenId -> isLocked boolean
 */
export async function batchCheckNFTLocksV2(
  contractAddress: string, 
  tokenIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  
  // Initialize all as unlocked
  tokenIds.forEach(tokenId => result.set(tokenId, false));
  
  const client = getRedisClient();
  if (!client) {
    return result; // Return all as unlocked if Redis not available
  }
  
  try {
    // Build all keys
    const keys = tokenIds.map(tokenId => getNFTKeyV2(contractAddress, tokenId));
    
    // Use Redis pipeline for batch operation
    const pipeline = client.pipeline();
    keys.forEach(key => pipeline.exists(key));
    
    const results = await pipeline.exec();
    
    // Process results
    if (results) {
      results.forEach((res, index) => {
        const isLocked = res[1] === 1; // exists returns 1 if key exists
        result.set(tokenIds[index], isLocked);
      });
    }
    
    return result;
  } catch (error) {
    console.error('Error in batch check NFT locks:', error);
    return result; // Return all as unlocked on error
  }
}

/**
 * V2 BATCH: Lock multiple NFTs in a single operation
 * @returns Map of tokenId -> success boolean
 */
export async function batchLockNFTsV2(
  contractAddress: string,
  tokenIds: string[],
  walletAddress: string
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  
  // Initialize all as failed
  tokenIds.forEach(tokenId => result.set(tokenId, false));
  
  const client = getRedisClient();
  if (!client) {
    return result;
  }
  
  try {
    const ttl = getSecondsUntilNextUTCMidnight();
    const pipeline = client.pipeline();
    
    // Add all SET operations to pipeline
    tokenIds.forEach(tokenId => {
      const key = getNFTKeyV2(contractAddress, tokenId);
      pipeline.set(key, walletAddress.toLowerCase(), {
        nx: true, // Only set if not exists
        ex: ttl   // Expire at midnight UTC
      });
    });
    
    const results = await pipeline.exec();
    
    // Process results
    if (results) {
      results.forEach((res, index) => {
        const success = res[1] === 'OK';
        result.set(tokenIds[index], success);
      });
    }
    
    return result;
  } catch (error) {
    console.error('Error in batch lock NFTs:', error);
    return result;
  }
}

export default {
  lockNFT,
  isNFTLocked,
  getNFTLockInfo,
  unlockNFT,
  getLockedNFTsByWallet,
  getNFTLockStats,
  testConnection,
  getSecondsUntilNextUTCMidnight,
  getRedisUrl,
  getRedisToken,
  isRedisAvailable,
  resetRedisAvailability,
  // V2 functions
  lockNFTV2,
  isNFTLockedV2,
  getNFTLockInfoV2,
  // V2 Batch functions
  batchCheckNFTLocksV2,
  batchLockNFTsV2
};