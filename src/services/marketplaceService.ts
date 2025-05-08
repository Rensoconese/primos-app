import { Redis } from '@upstash/redis';

// Inicializar cliente Redis
const redis = new Redis({
  url: process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Prefijo para las claves de caché de NFTs listados
const NFT_LISTED_KEY_PREFIX = 'nft:listed:';
// Prefijo para la clave de caché de listados del marketplace
const MARKETPLACE_LISTINGS_KEY = 'marketplace:listings:primos';
// Dirección del contrato de Primos NFT
export const PRIMOS_NFT_CONTRACT = '0x23924869ff64ab205b3e3be388a373d75de74ebd';

// Interfaces para tipado
interface NFTItem {
  tokenId: string;
  contractAddress: string;
  name?: string;
  imageUrl?: string;
}

interface NFTListing {
  tokenId: string;
  contractAddress: string;
  seller: string;
  price: string;
  timestamp: string;
  listingUrl: string;
  image?: string;
  name?: string;
}

// Generar clave para NFT listado
function getNFTListedKey(walletAddress: string, tokenId: string): string {
  return `${NFT_LISTED_KEY_PREFIX}${walletAddress.toLowerCase()}:${tokenId}`;
}

/**
 * Verifica si un NFT está listado en el marketplace usando el endpoint check-nft-listing
 * que utiliza la misma lógica que test-marketplace
 * 
 * NOTA: Esta función siempre consulta directamente a la API sin usar caché
 */
export async function isNFTListed(contractAddress: string, tokenId: string, ownerAddress: string): Promise<boolean> {
  try {
    console.log(`Verificando si NFT ${contractAddress}:${tokenId} está listado para wallet ${ownerAddress}`);
    
    // Obtener la URL base
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Siempre forzar refresh=true para evitar caché
    const response = await fetch(`${baseUrl}/api/check-nft-listing?wallet_address=${ownerAddress}&token_id=${tokenId}&refresh=true`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`API error: ${data.error}`);
    }
    
    const isListed = data.isListed || false;
    
    console.log(`NFT ${tokenId} - Estado en API: ${isListed ? 'Listado' : 'No listado'}`);
    
    return isListed;
  } catch (error) {
    console.error(`Error checking if NFT is listed: ${error}`);
    return false; // En caso de error, asumimos que no está listado
  }
}

/**
 * Verifica el estado de listado de múltiples NFTs en paralelo
 * utilizando el endpoint check-nft-listing para cada NFT
 * 
 * NOTA: Esta función siempre consulta directamente a la API sin usar caché
 */
export async function checkNFTsListingStatus(
  walletAddress: string, 
  nfts: Array<{contractAddress: string, tokenId: string}>
): Promise<Record<string, boolean>> {
  try {
    console.log(`Verificando estado de listado para ${nfts.length} NFTs de wallet ${walletAddress}`);
    
    // Asegurarse de que la dirección de wallet esté en minúsculas
    const lowerWalletAddress = walletAddress.toLowerCase();
    
    // Obtener la URL base
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Verificar cada NFT en paralelo usando el endpoint check-nft-listing
    const checkPromises = nfts.map(async nft => {
      try {
        // Siempre forzar refresh=true para evitar caché
        const response = await fetch(`${baseUrl}/api/check-nft-listing?wallet_address=${lowerWalletAddress}&token_id=${nft.tokenId}&refresh=true`);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(`API error: ${data.error}`);
        }
        
        const isListed = data.isListed || false;
        
        return { tokenId: nft.tokenId, isListed };
      } catch (error) {
        console.error(`Error checking NFT ${nft.tokenId}:`, error);
        return { tokenId: nft.tokenId, isListed: false };
      }
    });
    
    // Esperar a que todas las verificaciones se completen
    const results = await Promise.all(checkPromises);
    
    // Construir el mapa de resultados
    const statusMap: Record<string, boolean> = {};
    results.forEach(result => {
      statusMap[result.tokenId] = result.isListed;
    });
    
    return statusMap;
  } catch (error) {
    console.error('Error checking NFTs listing status:', error);
    return {};
  }
}

/**
 * Obtiene todos los NFTs listados en el marketplace para la colección de Primos
 * 
 * NOTA: Esta función siempre consulta directamente a la API sin usar caché
 */
export async function getMarketplaceListings(): Promise<NFTListing[]> {
  try {
    // Obtener la URL base para el proxy
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Si no hay caché, consultar la API GraphQL a través del proxy
    const query = `
      query {
        erc721Tokens(
          tokenAddress: "${PRIMOS_NFT_CONTRACT}",
          auctionType: Sale,
          from: 0,
          size: 50
        ) {
          total
          results {
            tokenId
            owner
            name
            imageUrl
            order {
              orderStatus
              maker
              startedAt
              currentPrice
              paymentToken
            }
          }
        }
      }
    `;
    
    const response = await fetch(`${baseUrl}/api/skymavis-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      throw new Error(`GraphQL API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL query error: ${data.errors[0].message}`);
    }
    
    // Procesar los datos para obtener los NFTs listados
    const nftResults = data.data?.erc721Tokens?.results || [];
    const listings: NFTListing[] = nftResults
      .filter((nft: any) => nft.order && nft.order.orderStatus === 'OPEN')
      .map((nft: any) => ({
        tokenId: nft.tokenId,
        contractAddress: PRIMOS_NFT_CONTRACT,
        seller: nft.order.maker,
        price: `${nft.order.currentPrice || '?'} ${nft.order.paymentToken || 'RON'}`,
        timestamp: nft.order.startedAt,
        listingUrl: `https://marketplace.roninchain.com/collections/${PRIMOS_NFT_CONTRACT}/${nft.tokenId}`,
        image: nft.imageUrl,
        name: nft.name || `Primo #${nft.tokenId}`
      }));
    
    // No almacenar en caché para siempre obtener datos actualizados
    
    return listings;
  } catch (error) {
    console.error(`Error getting marketplace listings: ${error}`);
    return []; // En caso de error, devolver array vacío
  }
}

/**
 * Almacena el estado de listado en Redis con un TTL de 1 día
 */
export async function cacheListingStatus(walletAddress: string, tokenId: string, isListed: boolean): Promise<boolean> {
  try {
    const key = getNFTListedKey(walletAddress, tokenId);
    const ttl = 86400; // 1 día en segundos
    
    const result = await redis.set(key, isListed ? '1' : '0', { ex: ttl });
    return result === 'OK';
  } catch (error) {
    console.error(`Error caching listing status: ${error}`);
    return false;
  }
}

/**
 * Obtiene el estado de listado almacenado en caché
 */
export async function getCachedListingStatus(walletAddress: string, tokenId: string): Promise<boolean | null> {
  try {
    const key = getNFTListedKey(walletAddress, tokenId);
    const result = await redis.get(key);
    
    if (result === null) return null;
    return result === '1';
  } catch (error) {
    console.error(`Error getting cached listing status: ${error}`);
    return null;
  }
}

/**
 * Almacena los listados en caché con un TTL de 15 minutos
 */
async function cacheListings(listings: NFTListing[]): Promise<boolean> {
  try {
    const ttl = 900; // 15 minutos en segundos
    
    const result = await redis.set(MARKETPLACE_LISTINGS_KEY, JSON.stringify(listings), { ex: ttl });
    return result === 'OK';
  } catch (error) {
    console.error(`Error caching listings: ${error}`);
    return false;
  }
}

/**
 * Obtiene los listados almacenados en caché
 */
async function getCachedListings(): Promise<NFTListing[] | null> {
  try {
    const result = await redis.get(MARKETPLACE_LISTINGS_KEY);
    
    if (result === null) return null;
    return JSON.parse(result as string);
  } catch (error) {
    console.error(`Error getting cached listings: ${error}`);
    return null;
  }
}

/**
 * Limpia la caché de listados para una wallet específica
 */
export async function clearListingCache(walletAddress: string): Promise<void> {
  try {
    // Obtener todas las claves que coinciden con el patrón
    const keys = await redis.keys(`${NFT_LISTED_KEY_PREFIX}${walletAddress.toLowerCase()}:*`);
    
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`Error clearing listing cache: ${error}`);
  }
}

/**
 * Limpia la caché de listados del marketplace
 */
export async function clearMarketplaceListingsCache(): Promise<void> {
  try {
    await redis.del(MARKETPLACE_LISTINGS_KEY);
  } catch (error) {
    console.error(`Error clearing marketplace listings cache: ${error}`);
  }
}
