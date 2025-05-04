import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  try {
    const url = new URL(req.url);
    const walletAddress = url.searchParams.get('wallet_address');
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Query all NFTs registered for this wallet address
    const { data: nfts, error: nftsError } = await supabase
      .from('nfts')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase());
      
    if (nftsError) {
      return NextResponse.json(
        { error: nftsError.message },
        { status: 500 }
      );
    }
    
    // Calculate total bonus points
    const totalBonusPoints = nfts?.reduce((sum: number, nft: any) => sum + (nft.bonus_points || 0), 0) || 0;
    
    return NextResponse.json({
      count: nfts?.length || 0,
      nfts: nfts || [],
      totalBonusPoints,
    });
  } catch (err) {
    console.error('Server error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
