import { NextRequest, NextResponse } from 'next/server';
import { getNFTLockStats, getLockedNFTsByWallet } from '@/services/redisService';

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
    console.error('Error obteniendo estadísticas de Redis:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Error obteniendo estadísticas de Redis',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
