import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { transferTokensFromPool } from '@/lib/contract';

// Límites de seguridad
const MAX_POINTS_PER_CLAIM = 1000; // Máximo de puntos por claim individual
const MAX_CLAIMS_PER_REQUEST = 30; // Máximo de claims que se pueden procesar a la vez

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { 
      wallet_address, 
      claim_ids,
      claim_all = false 
    } = await req.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    console.log(`🔵 V2 CLAIM: Starting for ${walletLower}`);
    
    // Obtener claims pendientes
    let query = supabase
      .from('newcheckin_pending_claims')
      .select('*')
      .eq('wallet_address', walletLower)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    
    // Si se especifican IDs específicos
    if (claim_ids && claim_ids.length > 0) {
      if (claim_ids.length > MAX_CLAIMS_PER_REQUEST) {
        return NextResponse.json({ 
          error: `Cannot process more than ${MAX_CLAIMS_PER_REQUEST} claims at once` 
        }, { status: 400 });
      }
      query = query.in('id', claim_ids);
    }
    
    // Si es claim_all, limitar a MAX_CLAIMS_PER_REQUEST
    if (claim_all) {
      query = query.limit(MAX_CLAIMS_PER_REQUEST);
    }
    
    const { data: pendingClaims, error: claimsError } = await query;
    
    if (claimsError) {
      console.error('Error fetching pending claims:', claimsError);
      throw claimsError;
    }
    
    if (!pendingClaims || pendingClaims.length === 0) {
      return NextResponse.json({ 
        error: 'No pending claims found',
        pendingCount: 0
      }, { status: 400 });
    }
    
    console.log(`Found ${pendingClaims.length} pending claims`);
    
    // Validar cada claim individualmente (SEGURIDAD CRÍTICA)
    const validClaims = [];
    const invalidClaims = [];
    let totalPointsToClaim = 0;
    
    for (const claim of pendingClaims) {
      // Verificar que no haya expirado
      if (new Date(claim.expire_at) < new Date()) {
        invalidClaims.push({
          id: claim.id,
          reason: 'Expired'
        });
        continue;
      }
      
      // Verificar límite de puntos por seguridad
      if (claim.points_to_claim > MAX_POINTS_PER_CLAIM) {
        console.error(`⚠️ SECURITY: Claim ${claim.id} exceeds max points: ${claim.points_to_claim}`);
        invalidClaims.push({
          id: claim.id,
          reason: 'Exceeds maximum points limit'
        });
        continue;
      }
      
      validClaims.push(claim);
      totalPointsToClaim += claim.points_to_claim;
    }
    
    if (validClaims.length === 0) {
      return NextResponse.json({ 
        error: 'No valid claims to process',
        invalidClaims
      }, { status: 400 });
    }
    
    console.log(`Processing ${validClaims.length} valid claims for ${totalPointsToClaim} points`);
    
    // Transferir tokens desde el pool wallet
    let txHash = null;
    try {
      console.log(`Transferring ${totalPointsToClaim} Fire Dust tokens to ${wallet_address}`);
      
      // Verificar que tenemos la configuración necesaria
      if (!process.env.REWARD_POOL_PRIVATE_KEY) {
        console.error('❌ CRITICAL: REWARD_POOL_PRIVATE_KEY not configured');
        return NextResponse.json({ 
          error: 'Server configuration error',
          details: 'Pool wallet not configured. Please contact administrator.' 
        }, { status: 500 });
      }
      
      const result = await transferTokensFromPool(
        wallet_address,
        totalPointsToClaim
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to transfer tokens');
      }
      
      txHash = result.txHash;
      console.log(`✅ Tokens transferred successfully. TX: ${txHash}`);
      
    } catch (transferError: any) {
      console.error('Token transfer failed:', transferError);
      console.error('Error stack:', transferError.stack);
      return NextResponse.json({ 
        error: 'Failed to transfer tokens',
        details: transferError.message 
      }, { status: 500 });
    }
    
    // Actualizar claims como reclamados
    const claimIds = validClaims.map(c => c.id);
    const { error: updateError } = await supabase
      .from('newcheckin_pending_claims')
      .update({
        status: 'claimed',
        claimed_at: new Date().toISOString(),
        tx_hash: txHash
      })
      .in('id', claimIds);
    
    if (updateError) {
      console.error('Error updating claims:', updateError);
      // Los tokens ya se transfirieron, registrar el problema pero no fallar
    }
    
    // Registrar en historial
    const { data: claimHistory, error: historyError } = await supabase
      .from('newcheckin_claim_history')
      .insert({
        wallet_address: walletLower,
        points_claimed: totalPointsToClaim,
        tokens_received: totalPointsToClaim, // 1:1 ratio
        claim_ids: claimIds,
        tx_hash: txHash
      })
      .select()
      .single();
    
    if (historyError) {
      console.error('Error creating claim history:', historyError);
      // No fallar, los tokens ya se transfirieron
    }
    
    // Verificar si quedan más claims pendientes
    const { data: remainingClaims } = await supabase
      .from('newcheckin_pending_claims')
      .select('id, points_to_claim')
      .eq('wallet_address', walletLower)
      .eq('status', 'pending');
    
    const remainingPoints = remainingClaims?.reduce((sum, claim) => sum + claim.points_to_claim, 0) || 0;
    
    console.log(`✅ V2 Claim successful: ${totalPointsToClaim} tokens sent to ${walletLower}`);
    
    return NextResponse.json({
      success: true,
      claimResult: {
        claimsProcessed: validClaims.length,
        pointsClaimed: totalPointsToClaim,
        tokensReceived: totalPointsToClaim,
        txHash,
        invalidClaims
      },
      remaining: {
        pendingClaims: remainingClaims?.length || 0,
        pendingPoints: remainingPoints
      },
      message: `Successfully claimed ${totalPointsToClaim} Fire Dust tokens!`
    });
    
  } catch (error) {
    console.error('V2 Claim error:', error);
    return NextResponse.json({
      error: 'An error occurred while processing claim'
    }, { status: 500 });
  }
}

// GET endpoint para ver claims pendientes
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const url = new URL(req.url);
    const wallet_address = url.searchParams.get('wallet_address');
    const status = url.searchParams.get('status') || 'pending';
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    
    // Obtener claims
    const { data: claims, error } = await supabase
      .from('newcheckin_pending_claims')
      .select(`
        *,
        newcheckin_daily!inner(
          action_date,
          nft_count,
          base_points,
          streak_multiplier
        )
      `)
      .eq('wallet_address', walletLower)
      .eq('status', status)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching claims:', error);
      throw error;
    }
    
    // Calcular totales
    const totalPoints = claims?.reduce((sum, claim) => sum + claim.points_to_claim, 0) || 0;
    
    // Obtener historial de claims si se solicita
    let claimHistory = null;
    if (status === 'claimed') {
      const { data: history } = await supabase
        .from('newcheckin_claim_history')
        .select('*')
        .eq('wallet_address', walletLower)
        .order('created_at', { ascending: false })
        .limit(10);
      
      claimHistory = history;
    }
    
    return NextResponse.json({
      claims: claims || [],
      summary: {
        totalClaims: claims?.length || 0,
        totalPoints,
        status
      },
      history: claimHistory
    });
    
  } catch (error) {
    console.error('Error fetching claims:', error);
    return NextResponse.json({
      error: 'Failed to fetch claims'
    }, { status: 500 });
  }
}