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

// Función para obtener la URL de Redis
export const getRedisUrl = () => {
  // Primero intenta obtener URL directamente de las variables estándar
  const directUrl = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL || 
                   process.env.UPSTASH_REDIS_REST_URL || 
                   process.env.NEXT_PUBLIC_KV_REST_API_URL ||
                   process.env.KV_REST_API_URL;
  
  if (directUrl) return directUrl;
  
  // Si no hay URL directa, intenta extraer de las URLs completas
  const redisUrl = process.env.REDIS_URL;
  const kvUrl = process.env.KV_URL;
  
  if (redisUrl) {
    const credentials = extractCredentialsFromUrl(redisUrl);
    if (credentials) return credentials.url;
  }
  
  if (kvUrl) {
    const credentials = extractCredentialsFromUrl(kvUrl);
    if (credentials) return credentials.url;
  }
  
  return '';
};

// Función para obtener el token de Redis
export const getRedisToken = () => {
  // Primero intenta obtener token directamente de las variables estándar
  const directToken = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN || 
                     process.env.UPSTASH_REDIS_REST_TOKEN || 
                     process.env.NEXT_PUBLIC_KV_REST_API_TOKEN ||
                     process.env.KV_REST_API_TOKEN;
  
  if (directToken) return directToken;
  
  // Si no hay token directo, intenta extraer de las URLs completas
  const redisUrl = process.env.REDIS_URL;
  const kvUrl = process.env.KV_URL;
  
  if (redisUrl) {
    const credentials = extractCredentialsFromUrl(redisUrl);
    if (credentials) return credentials.token;
  }
  
  if (kvUrl) {
    const credentials = extractCredentialsFromUrl(kvUrl);
    if (credentials) return credentials.token;
  }
  
  return '';
};

const redis = new Redis({
  url: getRedisUrl(),
  token: getRedisToken(),
});

// Log para depuración
console.log('Redis URL:', getRedisUrl() ? 'Configurado' : 'No configurado');
console.log('Redis Token:', getRedisToken() ? 'Configurado' : 'No configurado');

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
  const key = getNFTKey(contractAddress, tokenId);
  const ttl = getSecondsUntilNextUTCMidnight();
  
  // Almacenar la wallet que bloqueó el NFT
  const result = await redis.set(key, walletAddress.toLowerCase(), { 
    nx: true, // Solo establecer si no existe
    ex: ttl    // Expirar automáticamente en el próximo reset UTC
  });
  
  return result === 'OK';
}

/**
 * Verifica si un NFT está bloqueado
 * @returns La dirección de wallet que bloqueó el NFT, o null si no está bloqueado
 */
export async function getNFTLockInfo(contractAddress: string, tokenId: string): Promise<string | null> {
  const key = getNFTKey(contractAddress, tokenId);
  return await redis.get(key);
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

/**
 * Desbloquea un NFT específico
 * @returns true si se desbloqueó correctamente, false si no estaba bloqueado
 */
export async function unlockNFT(contractAddress: string, tokenId: string): Promise<boolean> {
  const key = getNFTKey(contractAddress, tokenId);
  const result = await redis.del(key);
  return result === 1;
}

/**
 * Obtiene todos los NFTs bloqueados por una wallet específica
 * @returns Array de objetos {contractAddress, tokenId}
 */
export async function getLockedNFTsByWallet(walletAddress: string): Promise<Array<{contractAddress: string, tokenId: string}>> {
  // Obtener todas las claves que coinciden con el patrón
  const keys = await redis.keys(`${NFT_KEY_PREFIX}*`);
  const lockedNFTs = [];
  
  // Verificar cada clave para ver si está bloqueada por esta wallet
  for (const key of keys) {
    const lockingWallet = await redis.get(key);
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
}

/**
 * Obtiene estadísticas sobre NFTs bloqueados
 */
export async function getNFTLockStats(): Promise<{
  totalLocked: number,
  byWallet: Record<string, number>
}> {
  const keys = await redis.keys(`${NFT_KEY_PREFIX}*`);
  const walletCounts: Record<string, number> = {};
  
  for (const key of keys) {
    const wallet = await redis.get(key);
    if (wallet && typeof wallet === 'string') {
      walletCounts[wallet] = (walletCounts[wallet] || 0) + 1;
    }
  }
  
  return {
    totalLocked: keys.length,
    byWallet: walletCounts
  };
}

/**
 * Verifica la conexión con Redis
 * @returns true si la conexión es exitosa, false si no
 */
export async function testConnection(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    console.error('Error conectando a Redis:', error);
    return false;
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
  getRedisToken
};
