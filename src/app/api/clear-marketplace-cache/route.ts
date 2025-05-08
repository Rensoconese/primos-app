import { NextRequest, NextResponse } from 'next/server';
import { clearListingCache } from '@/services/marketplaceService';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const walletAddress = url.searchParams.get('wallet_address');
  
  if (!walletAddress) {
    return NextResponse.json({ 
      error: 'Wallet address is required' 
    }, { status: 400 });
  }
  
  try {
    // Limpiar la caché de listados para la wallet específica
    await clearListingCache(walletAddress);
    
    return NextResponse.json({ 
      success: true, 
      message: `Cache cleared for wallet ${walletAddress}`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error clearing marketplace cache:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to clear marketplace cache' 
    }, { status: 500 });
  }
}
