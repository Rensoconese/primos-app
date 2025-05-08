import { NextRequest, NextResponse } from 'next/server';
import { PRIMOS_NFT_CONTRACT, clearListingCache } from '@/services/marketplaceService';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const walletAddress = url.searchParams.get('wallet_address');
  const tokenId = url.searchParams.get('token_id');
  // Ignoramos el parámetro refresh y siempre forzamos la actualización
  
  if (!walletAddress || !tokenId) {
    return NextResponse.json({ 
      error: 'Wallet address and token ID are required' 
    }, { status: 400 });
  }
  
  // Convertir la dirección de wallet a minúsculas
  const lowerWalletAddress = walletAddress.toLowerCase();
  
  try {
    // Siempre limpiar la caché para obtener datos actualizados
    await clearListingCache(walletAddress);
    
    // Consultar la API GraphQL a través del proxy para obtener los NFTs del usuario
    const userNFTsQuery = `
      query {
        erc721Tokens(
          tokenAddress: "${PRIMOS_NFT_CONTRACT}",
          owner: "${lowerWalletAddress}",
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
    const userNFTsResponse = await fetch(`${req.nextUrl.origin}/api/skymavis-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: userNFTsQuery })
    });
    
    if (!userNFTsResponse.ok) {
      const errorData = await userNFTsResponse.json();
      throw new Error(errorData.error || `Error en la solicitud al proxy: ${userNFTsResponse.status}`);
    }
    
    const userNFTsData = await userNFTsResponse.json();
    
    if (!userNFTsData.data || !userNFTsData.data.erc721Tokens || !userNFTsData.data.erc721Tokens.results) {
      throw new Error('Formato de respuesta inválido');
    }
    
    // Obtener los NFTs del usuario
    const nftResults = userNFTsData.data.erc721Tokens.results || [];
    
    // Buscar el NFT específico por su tokenId
    const targetNft = nftResults.find((nft: any) => nft.tokenId === tokenId);
    
    if (!targetNft) {
      return NextResponse.json({ 
        success: true, 
        isListed: false,
        message: `NFT ${tokenId} no encontrado para la wallet ${walletAddress}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verificar si el NFT está listado en el marketplace
    const isListed = targetNft.order && 
                    targetNft.order.orderStatus === 'OPEN' && 
                    targetNft.order.maker.toLowerCase() === lowerWalletAddress;
    
    // Construir la URL del marketplace si está listado
    const listingUrl = isListed 
      ? `https://marketplace.roninchain.com/collections/${PRIMOS_NFT_CONTRACT}/${tokenId}`
      : undefined;
    
    return NextResponse.json({ 
      success: true, 
      isListed,
      listingUrl,
      nft: {
        tokenId,
        contractAddress: PRIMOS_NFT_CONTRACT,
        owner: targetNft.owner
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error checking NFT listing status:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to check NFT listing status' 
    }, { status: 500 });
  }
}
