// Archivo refactorizado para eliminar la dependencia de Redis

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

/**
 * Verifica si un NFT está listado en el marketplace usando el endpoint check-nft-listing
 * que utiliza la misma lógica que test-marketplace
 * 
 * NOTA: Esta función consulta la API con manejo de errores mejorado
 */
export async function isNFTListed(contractAddress: string, tokenId: string, ownerAddress: string): Promise<boolean> {
  try {
    console.log(`Verificando si NFT ${contractAddress}:${tokenId} está listado para wallet ${ownerAddress}`);
    
    // Obtener la URL base
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Usar refresh=true solo en desarrollo
    const isDevEnvironment = process.env.NODE_ENV === 'development';
    const refreshParam = isDevEnvironment ? '&refresh=true' : '';
    
    // Hacer la solicitud con manejo de errores mejorado
    const response = await fetch(`${baseUrl}/api/check-nft-listing?wallet_address=${ownerAddress}&token_id=${tokenId}${refreshParam}`);
    
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
        // Usar refresh=true solo en desarrollo
        const isDevEnvironment = process.env.NODE_ENV === 'development';
        const refreshParam = isDevEnvironment ? '&refresh=true' : '';
        
        const response = await fetch(`${baseUrl}/api/check-nft-listing?wallet_address=${lowerWalletAddress}&token_id=${nft.tokenId}${refreshParam}`);
        
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
 */
export async function getMarketplaceListings(): Promise<NFTListing[]> {
  try {
    // Obtener la URL base para el proxy
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Consultar la API GraphQL a través del proxy
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
    
    return listings;
  } catch (error) {
    console.error(`Error getting marketplace listings: ${error}`);
    return []; // En caso de error, devolver array vacío
  }
}

/**
 * Función de limpieza de caché refactorizada para no usar Redis
 * Ahora simplemente registra un mensaje en la consola
 */
export async function clearListingCache(walletAddress: string): Promise<void> {
  console.log(`[Simulación] Limpiando caché para wallet ${walletAddress}`);
  // Esta función ya no hace nada con Redis, solo registra un mensaje
}

/**
 * Función de limpieza de caché refactorizada para no usar Redis
 * Ahora simplemente registra un mensaje en la consola
 */
export async function clearMarketplaceListingsCache(): Promise<void> {
  console.log('[Simulación] Limpiando caché de listados del marketplace');
  // Esta función ya no hace nada con Redis, solo registra un mensaje
}
