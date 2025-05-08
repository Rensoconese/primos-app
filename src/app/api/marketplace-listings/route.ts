import { NextRequest, NextResponse } from 'next/server';
import { PRIMOS_NFT_CONTRACT, clearMarketplaceListingsCache } from '@/services/marketplaceService';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === 'true';
  
  try {
    console.log('Obteniendo listados del marketplace...');
    
    // Si se solicita actualizar, limpiar la caché primero
    if (refresh) {
      console.log('Limpiando caché de listados del marketplace...');
      await clearMarketplaceListingsCache();
    }
    
    // Consultar la API GraphQL a través del proxy para obtener los NFTs listados
    const listedQuery = `
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
            order {
              orderStatus
              maker
            }
          }
        }
      }
    `;
    
    // Hacer la solicitud al proxy
    const listedResponse = await fetch(`${req.nextUrl.origin}/api/skymavis-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: listedQuery })
    });
    
    if (!listedResponse.ok) {
      const errorData = await listedResponse.json();
      throw new Error(errorData.error || `Error en la solicitud al proxy: ${listedResponse.status}`);
    }
    
    const listedData = await listedResponse.json();
    
    if (!listedData.data || !listedData.data.erc721Tokens || !listedData.data.erc721Tokens.results) {
      throw new Error('Formato de respuesta inválido');
    }
    
    // Obtener los NFTs listados
    const nftResults = listedData.data.erc721Tokens.results || [];
    const total = listedData.data.erc721Tokens.total || 0;
    
    // Procesar los NFTs listados
    const listings = nftResults
      .filter((nft: any) => nft.order && nft.order.orderStatus === 'OPEN')
      .map((nft: any) => {
        const tokenId = nft.tokenId;
        console.log(`NFT #${tokenId} listado por ${nft.order.maker}`);
        
        return {
          tokenId: tokenId,
          contractAddress: PRIMOS_NFT_CONTRACT,
          owner: nft.owner,
          seller: nft.order.maker,
          listingUrl: `https://marketplace.roninchain.com/collections/${PRIMOS_NFT_CONTRACT}/${tokenId}`
        };
      });
    
    return NextResponse.json({ 
      success: true, 
      listings,
      total,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting marketplace listings:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to get marketplace listings' 
    }, { status: 500 });
  }
}
