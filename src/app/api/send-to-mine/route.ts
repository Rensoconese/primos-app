import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getNFTPointsSafe } from '@/data/nftPoints';
import { lockNFT, testConnection } from '@/services/redisService';
import { isNFTListed } from '@/services/marketplaceService';
import { isSameUTCDay } from '@/services/dateService';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { wallet_address, transaction_hash } = await req.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    
    // Verificar que el usuario existe
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletLower)
      .single();
    
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'User not found. Please do check-in first.' 
      }, { status: 400 });
    }
    
    // Verificar que hizo check-in hoy
    const { data: todayCheckIn, error: checkInError } = await supabase
      .from('check_ins')
      .select('*')
      .eq('wallet_address', walletLower)
      .order('check_in_date', { ascending: false })
      .limit(1)
      .single();
    
    if (checkInError || !todayCheckIn) {
      return NextResponse.json({ 
        error: 'No check-in found for today. Please do check-in first.' 
      }, { status: 400 });
    }
    
    // Verificar que el check-in es de hoy (UTC)
    if (!isSameUTCDay(new Date(todayCheckIn.check_in_date), new Date())) {
      return NextResponse.json({ 
        error: 'Check-in is not from today. Please do check-in first.' 
      }, { status: 400 });
    }
    
    // Verificar que no ha minado ya hoy
    if (todayCheckIn.mining_completed) {
      return NextResponse.json({ 
        error: 'You have already sent primos to mine today.',
        alreadyMined: true,
        pointsEarned: todayCheckIn.points_earned 
      }, { status: 400 });
    }
    
    // IMPORTANTE: Verificar si los NFTs ya están bloqueados (indica que ya minó)
    // Esto es crítico porque Redis es la fuente de verdad para el bloqueo diario
    const { isNFTLocked } = await import('@/services/redisService');
    
    // Verificar con algunos NFTs si ya están bloqueados
    const { data: userNftsCheck } = await supabase
      .from('nfts')
      .select('token_id')
      .eq('wallet_address', walletLower)
      .limit(3); // Solo verificar algunos para performance
    
    if (userNftsCheck && userNftsCheck.length > 0) {
      let lockedCount = 0;
      for (const nft of userNftsCheck) {
        const locked = await isNFTLocked(
          '0x23924869ff64ab205b3e3be388a373d75de74ebd',
          String(nft.token_id)
        );
        if (locked) lockedCount++;
      }
      
      // Si más del 50% están bloqueados, ya minó hoy
      if (lockedCount > 0) {
        console.log(`NFTs already locked for ${walletLower}, mining was already done today`);
        
        // Actualizar DB si no estaba marcado como minado
        if (!todayCheckIn.mining_completed) {
          await supabase
            .from('check_ins')
            .update({ 
              mining_completed: true,
              mining_timestamp: new Date().toISOString()
            })
            .eq('id', todayCheckIn.id);
        }
        
        return NextResponse.json({ 
          error: 'Your NFTs are already locked. Mining was completed today.',
          alreadyMined: true,
          pointsEarned: todayCheckIn.points_earned || 0
        }, { status: 400 });
      }
    }
    
    // Obtener NFTs del usuario
    const { data: userNfts, error: nftsError } = await supabase
      .from('nfts')
      .select('token_id, wallet_address')
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
        pointsEarned: 0
      }, { status: 400 });
    }
    
    // Verificar conexión Redis
    console.log('🔴 MINING: Testing Redis connection...');
    const redisWorking = await testConnection();
    console.log(`🔴 MINING: Redis status = ${redisWorking ? 'WORKING' : 'FAILED'}`);
    
    // Calcular puntos y filtrar NFTs disponibles
    let totalPoints = 0;
    const eligibleNfts = [];
    const nftsUsed = [];
    const marketplaceBlocked = [];
    
    for (const nft of userNfts) {
      const tokenId = String(nft.token_id);
      
      // Verificar si está listado en marketplace
      const isListed = await isNFTListed(
        '0x23924869ff64ab205b3e3be388a373d75de74ebd',
        tokenId
      );
      
      if (isListed) {
        marketplaceBlocked.push(tokenId);
        console.log(`NFT #${tokenId} blocked - listed in marketplace`);
        continue;
      }
      
      // Obtener puntos del archivo nftPoints.ts
      const points = getNFTPointsSafe(tokenId, 0);
      if (points > 0) {
        totalPoints += points;
        eligibleNfts.push({
          token_id: tokenId,
          points: points
        });
        nftsUsed.push(parseInt(tokenId));
      }
    }
    
    console.log(`Mining calculation: ${eligibleNfts.length} NFTs, base points: ${totalPoints}`);
    
    // Calcular multiplicador basado en la racha
    let multiplier = 1.0;
    if (user.current_streak >= 29) multiplier = 3.0;
    else if (user.current_streak >= 22) multiplier = 2.5;
    else if (user.current_streak >= 15) multiplier = 2.0;
    else if (user.current_streak >= 8) multiplier = 1.5;
    
    // Calcular puntos finales con multiplicador
    const pointsEarned = Math.round(totalPoints * multiplier);
    console.log(`Points earned: ${totalPoints} × ${multiplier} = ${pointsEarned}`);
    
    // Bloquear NFTs en Redis (si está disponible)
    if (redisWorking && eligibleNfts.length > 0) {
      console.log(`Locking ${eligibleNfts.length} NFTs in Redis...`);
      for (const nft of eligibleNfts) {
        await lockNFT(
          '0x23924869ff64ab205b3e3be388a373d75de74ebd',
          nft.token_id,
          walletLower
        );
      }
      console.log('NFTs locked successfully');
    }
    
    // Actualizar check-in con información de minería
    const { error: updateError } = await supabase
      .from('check_ins')
      .update({
        mining_completed: true,
        mining_timestamp: new Date().toISOString(),
        points_earned: pointsEarned,
        multiplier: multiplier,
        nfts_used: nftsUsed,
        mining_tx_hash: transaction_hash || null
      })
      .eq('id', todayCheckIn.id);
    
    if (updateError) {
      console.error('Error updating check-in:', updateError);
      return NextResponse.json({ 
        error: 'Failed to update mining status' 
      }, { status: 500 });
    }
    
    // Actualizar puntos totales del usuario
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        total_points: (user.total_points || 0) + pointsEarned
      })
      .eq('wallet_address', walletLower);
    
    if (userUpdateError) {
      console.error('Error updating user points:', userUpdateError);
      // No fallar la operación por esto
    }
    
    // Registrar uso de NFTs (para histórico)
    if (eligibleNfts.length > 0) {
      const usageRecords = eligibleNfts.map(nft => ({
        token_id: parseInt(nft.token_id),
        contract_address: '0x23924869ff64ab205b3e3be388a373d75de74ebd',
        usage_date: new Date().toISOString().split('T')[0],
        check_in_id: todayCheckIn.id,
        wallet_address: walletLower
      }));
      
      const { error: usageError } = await supabase
        .from('nft_usage_tracking')
        .insert(usageRecords);
      
      if (usageError) {
        console.error('Error tracking NFT usage:', usageError);
        // No fallar la operación por esto
      }
    }
    
    return NextResponse.json({
      success: true,
      pointsEarned,
      multiplier,
      nftsUsed: eligibleNfts.length,
      marketplaceBlocked: marketplaceBlocked.length,
      totalPoints: (user.total_points || 0) + pointsEarned,
      message: `Successfully sent ${eligibleNfts.length} primos to mine! Earned ${pointsEarned} points.`
    });
    
  } catch (error) {
    console.error('Mining error:', error);
    return NextResponse.json({
      error: 'An error occurred while sending primos to mine'
    }, { status: 500 });
  }
}

// GET endpoint para verificar estado de minería
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const url = new URL(req.url);
    const wallet_address = url.searchParams.get('wallet_address');
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    
    // Obtener check-in de hoy
    const { data: todayCheckIn, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('wallet_address', walletLower)
      .order('check_in_date', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !todayCheckIn) {
      return NextResponse.json({
        canMine: false,
        hasCheckedIn: false,
        hasMined: false,
        message: 'No check-in found. Please do check-in first.'
      });
    }
    
    // Verificar si el check-in es de hoy
    const isToday = isSameUTCDay(new Date(todayCheckIn.check_in_date), new Date());
    
    if (!isToday) {
      return NextResponse.json({
        canMine: false,
        hasCheckedIn: false,
        hasMined: false,
        message: 'No check-in today. Please do check-in first.'
      });
    }
    
    // Verificar estado en Redis (fuente de verdad para bloqueo diario)
    let actuallyMined = todayCheckIn.mining_completed || false;
    
    // Verificar algunos NFTs en Redis para confirmar si ya minó
    const { isNFTLocked } = await import('@/services/redisService');
    const { data: userNftsCheck } = await supabase
      .from('nfts')
      .select('token_id')
      .eq('wallet_address', walletLower)
      .limit(3);
    
    if (userNftsCheck && userNftsCheck.length > 0) {
      let lockedCount = 0;
      for (const nft of userNftsCheck) {
        const locked = await isNFTLocked(
          '0x23924869ff64ab205b3e3be388a373d75de74ebd',
          String(nft.token_id)
        );
        if (locked) lockedCount++;
      }
      
      // Si encontramos NFTs bloqueados, ya minó
      if (lockedCount > 0) {
        actuallyMined = true;
        
        // Sincronizar DB si no estaba actualizada
        if (!todayCheckIn.mining_completed) {
          await supabase
            .from('check_ins')
            .update({ 
              mining_completed: true,
              mining_timestamp: todayCheckIn.mining_timestamp || new Date().toISOString()
            })
            .eq('id', todayCheckIn.id);
        }
      }
    }
    
    // Obtener cantidad de NFTs usados si ya minó
    let nftsUsed = 0;
    if (actuallyMined && todayCheckIn.nfts_used) {
      nftsUsed = Array.isArray(todayCheckIn.nfts_used) 
        ? todayCheckIn.nfts_used.length 
        : 0;
    }
    
    return NextResponse.json({
      canMine: !actuallyMined,
      hasCheckedIn: true,
      hasMined: actuallyMined,
      pointsEarned: todayCheckIn.points_earned || 0,
      nftsUsed: nftsUsed,
      miningTimestamp: todayCheckIn.mining_timestamp,
      message: actuallyMined 
        ? `Already mined today. Earned ${todayCheckIn.points_earned} points.`
        : 'Ready to send primos to mine!'
    });
    
  } catch (error) {
    console.error('Error checking mining status:', error);
    return NextResponse.json({
      error: 'Failed to check mining status'
    }, { status: 500 });
  }
}