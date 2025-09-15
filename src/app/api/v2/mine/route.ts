import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getNFTPointsSafe } from '@/data/nftPoints';
import { lockNFTV2, isNFTLockedV2, testConnection } from '@/services/redisService';
import { isNFTBlockedToday, checkMultipleNFTBlocks } from '@/services/nftBlockingService';
import { isNFTListed } from '@/services/marketplaceService';

const NFT_CONTRACT = '0x23924869ff64ab205b3e3be388a373d75de74ebd';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { wallet_address } = await req.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    const todayDate = new Date().toISOString().split('T')[0];
    
    console.log(`🔵 V2 MINING: Starting for ${walletLower}`);
    
    // Verificar que hizo check-in hoy
    const { data: todayRecord, error: recordError } = await supabase
      .from('newcheckin_daily')
      .select('*')
      .eq('wallet_address', walletLower)
      .eq('action_date', todayDate)
      .single();
    
    if (recordError || !todayRecord) {
      return NextResponse.json({ 
        error: 'No check-in found for today. Please do check-in first.' 
      }, { status: 400 });
    }
    
    if (!todayRecord.checkin_done) {
      return NextResponse.json({ 
        error: 'Check-in not completed. Please do check-in first.' 
      }, { status: 400 });
    }
    
    if (todayRecord.mining_done) {
      // Ya minó hoy, buscar el pending claim
      const { data: existingClaim } = await supabase
        .from('newcheckin_pending_claims')
        .select('*')
        .eq('daily_id', todayRecord.id)
        .single();
      
      return NextResponse.json({ 
        error: 'Already mined today',
        alreadyMined: true,
        pendingClaim: existingClaim
      }, { status: 400 });
    }
    
    // Verificar Redis
    console.log('Testing Redis connection...');
    const redisWorking = await testConnection();
    console.log(`Redis status: ${redisWorking ? 'WORKING' : 'FAILED'}`);
    
    // Obtener NFTs del usuario desde la base de datos
    const { data: userNfts, error: nftsError } = await supabase
      .from('nfts')
      .select('token_id')
      .eq('wallet_address', walletLower);
    
    if (nftsError) {
      console.error('Error fetching NFTs:', nftsError);
      return NextResponse.json({ 
        error: 'Failed to fetch your NFTs' 
      }, { status: 500 });
    }
    
    if (!userNfts || userNfts.length === 0) {
      return NextResponse.json({ 
        error: 'No NFTs found. You need NFTs to mine.',
        nftCount: 0,
        pointsEarned: 0
      }, { status: 400 });
    }
    
    console.log(`Found ${userNfts.length} NFTs for wallet ${walletLower}`);
    
    // Primero verificar qué NFTs están bloqueados en la DB (más confiable que Redis)
    const tokenIds = userNfts.map(nft => String(nft.token_id));
    console.log(`V2: Checking database blocks for ${tokenIds.length} NFTs...`);
    const dbBlockedMap = await checkMultipleNFTBlocks(tokenIds);
    
    // Calcular puntos y filtrar NFTs disponibles
    let basePoints = 0;
    const eligibleNfts = [];
    const blockedNfts = [];
    const listedNfts = [];
    
    console.log(`Processing ${userNfts.length} NFTs...`);
    
    // Procesar NFTs con timeout general
    const processTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('NFT processing timeout')), 15000)
    );
    
    const processNFTs = async () => {
      for (const nft of userNfts) {
        const tokenId = String(nft.token_id);
        
        // PRIMERO: Verificar si está bloqueado en la BASE DE DATOS
        if (dbBlockedMap.get(tokenId)) {
          blockedNfts.push(tokenId);
          console.log(`V2 DB: NFT #${tokenId} already used today (blocked in database)`);
          continue;
        }
        
        // SEGUNDO: Verificar si está bloqueado en Redis (backup, por si acaso)
        if (redisWorking) {
          const isLocked = await isNFTLockedV2(NFT_CONTRACT, tokenId);
          if (isLocked) {
            blockedNfts.push(tokenId);
            console.log(`V2 Redis: NFT #${tokenId} already locked today`);
            continue;
          }
        }
        
        // TERCERO: Verificar si está listado en marketplace (con timeout)
        const marketplaceCheckPromise = isNFTListed(NFT_CONTRACT, tokenId, walletLower);
        const timeoutPromise = new Promise<boolean>((resolve) => 
          setTimeout(() => resolve(false), 2000) // 2 segundos timeout
        );
        
        try {
          const isListed = await Promise.race([marketplaceCheckPromise, timeoutPromise]);
          if (isListed) {
            listedNfts.push(tokenId);
            console.log(`NFT #${tokenId} listed on marketplace`);
            continue;
          }
        } catch (marketplaceError) {
          // Si falla o timeout, asumimos que NO está listado para no bloquear el mining
          console.warn(`Marketplace check failed/timeout for NFT #${tokenId}, assuming not listed`);
        }
        
        // Obtener puntos del archivo
        const points = getNFTPointsSafe(tokenId, 0);
        if (points > 0) {
          basePoints += points;
          eligibleNfts.push({ token_id: tokenId, points });
        }
      }
    };
    
    try {
      await Promise.race([processNFTs(), processTimeout]);
    } catch (timeoutError) {
      console.error('NFT processing timed out:', timeoutError);
      return NextResponse.json({ 
        error: 'Mining request timed out. Please try again.',
        timeout: true
      }, { status: 408 });
    }
    
    console.log(`Eligible NFTs: ${eligibleNfts.length}, Base points: ${basePoints}`);
    
    if (eligibleNfts.length === 0) {
      return NextResponse.json({ 
        error: 'No eligible NFTs available for mining',
        blocked: blockedNfts.length,
        listed: listedNfts.length
      }, { status: 400 });
    }
    
    // Calcular puntos finales con multiplicador
    const multiplier = todayRecord.streak_multiplier || 1.0;
    const finalPoints = Math.round(basePoints * multiplier);
    
    console.log(`Points calculation: ${basePoints} × ${multiplier} = ${finalPoints}`);
    
    // Bloquear NFTs en Redis V2
    if (redisWorking) {
      console.log(`V2: Locking ${eligibleNfts.length} NFTs in Redis...`);
      const lockResults = [];
      for (const nft of eligibleNfts) {
        const locked = await lockNFTV2(NFT_CONTRACT, nft.token_id, walletLower);
        lockResults.push({ tokenId: nft.token_id, locked });
        console.log(`V2: NFT #${nft.token_id} lock result: ${locked ? 'LOCKED' : 'FAILED'}`);
      }
      console.log('V2: Lock results:', lockResults);
      console.log(`V2: Successfully locked ${lockResults.filter(r => r.locked).length}/${eligibleNfts.length} NFTs`);
    } else {
      console.warn('⚠️ V2: Redis not working - NFTs will NOT be locked!');
    }
    
    // Actualizar registro diario CON LOS NFTs USADOS (usando transacción con lock)
    const nftIdsUsed = eligibleNfts.map(nft => String(nft.token_id));
    
    // Registrar intento de mining en auditoría
    await supabase.rpc('log_mining_attempt', {
      p_wallet: walletLower,
      p_action: 'attempt',
      p_nfts_attempted: nftIdsUsed,
      p_points_attempted: finalPoints
    });
    
    // NUEVO: Usar función atómica que hace todo en una transacción
    // Esto previene race conditions y garantiza consistencia
    const { data: lockResult, error: updateError } = await supabase
      .rpc('mine_with_atomic_lock', {
        p_wallet: walletLower,
        p_nfts: nftIdsUsed,
        p_record_id: todayRecord.id,
        p_base_points: basePoints
      });
    
    if (updateError) {
      console.error('Error in atomic mining transaction:', updateError);
      // Registrar fallo en auditoría
      await supabase.rpc('log_mining_attempt', {
        p_wallet: walletLower,
        p_action: 'failed',
        p_nfts_attempted: nftIdsUsed,
        p_failure_reason: updateError.message
      });
      throw updateError;
    }
    
    // Verificar el resultado de la transacción
    if (lockResult && !lockResult.success) {
      console.error('Mining failed:', lockResult.error);
      
      // Registrar bloqueo en auditoría
      await supabase.rpc('log_mining_attempt', {
        p_wallet: walletLower,
        p_action: 'blocked',
        p_nfts_attempted: nftIdsUsed,
        p_nfts_blocked: lockResult.conflicted_nfts || [],
        p_failure_reason: lockResult.error
      });
      
      if (lockResult.invalid_nft) {
        return NextResponse.json({
          error: lockResult.error,
          invalid_nft: lockResult.invalid_nft
        }, { status: 400 }); // 400 Bad Request - NFT no owned
      }
      
      if (lockResult.conflicted_nfts) {
        return NextResponse.json({
          error: 'Some NFTs were already used today',
          conflicted_nfts: lockResult.conflicted_nfts
        }, { status: 409 }); // 409 Conflict
      }
      
      return NextResponse.json({
        error: lockResult.error || 'Mining failed'
      }, { status: 400 });
    }
    
    console.log(`✅ V2: Atomic mining successful for ${walletLower}:`, lockResult);
    
    // Registrar éxito en auditoría
    await supabase.rpc('log_mining_attempt', {
      p_wallet: walletLower,
      p_action: 'success',
      p_nfts_attempted: nftIdsUsed,
      p_points_attempted: basePoints,
      p_points_earned: finalPoints,
      p_metadata: { multiplier, nfts_blocked: lockResult.nfts_blocked }
    });
    
    // Crear pending claim (LA CLAVE: no se suma a ningún total)
    const { data: pendingClaim, error: claimError } = await supabase
      .from('newcheckin_pending_claims')
      .insert({
        wallet_address: walletLower,
        daily_id: todayRecord.id,
        points_to_claim: finalPoints,
        status: 'pending'
      })
      .select()
      .single();
    
    if (claimError) {
      console.error('Error creating pending claim:', claimError);
      throw claimError;
    }
    
    console.log(`✅ V2 Mining successful: ${finalPoints} points pending for ${walletLower}`);
    
    return NextResponse.json({
      success: true,
      miningResult: {
        nftsUsed: eligibleNfts.length,
        basePoints,
        multiplier,
        finalPoints,
        blockedNfts: blockedNfts.length,
        listedNfts: listedNfts.length
      },
      pendingClaim: {
        id: pendingClaim.id,
        points: pendingClaim.points_to_claim,
        status: pendingClaim.status
      },
      message: `Successfully mined ${finalPoints} points! They are now pending for claim.`
    });
    
  } catch (error) {
    console.error('V2 Mining error:', error);
    return NextResponse.json({
      error: 'An error occurred while mining'
    }, { status: 500 });
  }
}

// GET endpoint para verificar estado de mining
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const url = new URL(req.url);
    const wallet_address = url.searchParams.get('wallet_address');
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    const todayDate = new Date().toISOString().split('T')[0];
    
    // Obtener registro de hoy
    const { data: todayRecord } = await supabase
      .from('newcheckin_daily')
      .select('*')
      .eq('wallet_address', walletLower)
      .eq('action_date', todayDate)
      .single();
    
    if (!todayRecord) {
      return NextResponse.json({
        canMine: false,
        hasCheckedIn: false,
        hasMined: false,
        message: 'No check-in today'
      });
    }
    
    // Si ya minó, buscar el pending claim
    let pendingClaim = null;
    if (todayRecord.mining_done) {
      const { data: claim } = await supabase
        .from('newcheckin_pending_claims')
        .select('*')
        .eq('daily_id', todayRecord.id)
        .single();
      
      pendingClaim = claim;
    }
    
    return NextResponse.json({
      canMine: todayRecord.checkin_done && !todayRecord.mining_done,
      hasCheckedIn: todayRecord.checkin_done,
      hasMined: todayRecord.mining_done,
      nftCount: todayRecord.nft_count || 0,
      basePoints: todayRecord.base_points || 0,
      multiplier: todayRecord.streak_multiplier || 1.0,
      pendingClaim
    });
    
  } catch (error) {
    console.error('Error checking mining status:', error);
    return NextResponse.json({
      error: 'Failed to check mining status'
    }, { status: 500 });
  }
}