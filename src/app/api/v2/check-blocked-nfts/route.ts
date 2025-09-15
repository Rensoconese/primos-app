import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { token_ids } = await req.json();
    
    if (!token_ids || !Array.isArray(token_ids)) {
      return NextResponse.json({ error: 'token_ids array is required' }, { status: 400 });
    }
    
    // Verificar qué NFTs están bloqueados usando la nueva función
    const { data, error } = await supabase
      .rpc('newcheckin_check_nfts_blocked', { p_token_ids: token_ids });
    
    if (error) {
      console.error('Error checking blocked NFTs:', error);
      return NextResponse.json({ error: 'Failed to check NFT blocks' }, { status: 500 });
    }
    
    // Convertir a un mapa para facilitar el uso en frontend
    const blockedMap: Record<string, boolean> = {};
    if (data && Array.isArray(data)) {
      data.forEach((item: { token_id: string; is_blocked: boolean }) => {
        blockedMap[item.token_id] = item.is_blocked;
      });
    }
    
    return NextResponse.json({ 
      success: true,
      blockedNfts: blockedMap,
      blockedCount: Object.values(blockedMap).filter(blocked => blocked).length
    });
    
  } catch (error) {
    console.error('Error in check-blocked-nfts:', error);
    return NextResponse.json({
      error: 'An error occurred while checking NFT blocks'
    }, { status: 500 });
  }
}

// GET endpoint para verificar un NFT específico
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const url = new URL(req.url);
    const token_id = url.searchParams.get('token_id');
    
    if (!token_id) {
      return NextResponse.json({ error: 'token_id is required' }, { status: 400 });
    }
    
    // Verificar si el NFT está bloqueado
    const { data, error } = await supabase
      .rpc('newcheckin_is_nft_blocked', { p_token_id: token_id });
    
    if (error) {
      console.error('Error checking NFT block:', error);
      return NextResponse.json({ error: 'Failed to check NFT block' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true,
      token_id,
      is_blocked: data || false
    });
    
  } catch (error) {
    console.error('Error in check-blocked-nfts GET:', error);
    return NextResponse.json({
      error: 'An error occurred while checking NFT block'
    }, { status: 500 });
  }
}