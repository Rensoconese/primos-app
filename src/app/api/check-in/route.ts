import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { calculateNFTPoints } from '@/services/nftService';
import { updateLeaderboard } from '@/services/leaderboardService';
import { normalizeToUTCMidnight, isSameUTCDay, getDayDifferenceUTC, getUTCDebugInfo } from '@/services/dateService';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { wallet_address, transaction_hash } = await req.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    // Verificar si el usuario existe
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', wallet_address.toLowerCase())
      .single();
    
    // Variable para detectar si se rompió la racha
    let streakBroken = false;
    let daysDiff = 0;
    
    // Si no existe, crearlo
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          wallet_address: wallet_address.toLowerCase(),
          current_streak: 1,
          max_streak: 1,
          total_check_ins: 1,
          last_check_in: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) throw createError;
      user = newUser;
    } else {
      // Actualizar streak y total_check_ins
      const lastCheckIn = new Date(user.last_check_in);
      const now = new Date();
      
      // Normalizar fechas a medianoche UTC usando dateService
      const lastCheckInDate = new Date(user.last_check_in);
      const nowDate = new Date();
      
      // Log de depuración con información detallada
      console.log('DEBUG UTC:', getUTCDebugInfo('Check-in API', nowDate));
      
      // Verificar si es el mismo día UTC
      if (isSameUTCDay(lastCheckInDate, nowDate)) {
        return NextResponse.json({ 
          error: 'Already checked in today (UTC)',
          user
        }, { status: 400 });
      }
      
      // Calculamos la diferencia en días para el streak
      const daysDiff = getDayDifferenceUTC(lastCheckInDate, nowDate);
      
      // Si es el día siguiente, incrementar streak
      // Si hay más de un día de diferencia, reiniciar el streak a 1 cuando se hace check-in
      // porque estamos empezando una nueva racha
      let newStreak;
      if (daysDiff === 1) {
        // Día consecutivo, incrementamos la racha actual
        newStreak = user.current_streak + 1;
      } else if (daysDiff > 1) {
        // Más de un día de diferencia, iniciamos una nueva racha con valor 1
        newStreak = 1;
        // Flag para indicar que se rompió la racha anterior
        streakBroken = true;
      } else {
        // Este caso no debería ocurrir normalmente (mismo día)
        newStreak = user.current_streak;
      }
      
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          current_streak: newStreak,
          max_streak: Math.max(newStreak, user.max_streak),
          total_check_ins: user.total_check_ins + 1,
          last_check_in: now.toISOString()
        })
        .eq('wallet_address', wallet_address.toLowerCase())
        .select()
        .single();
      
      if (updateError) throw updateError;
      user = updatedUser;
    }
    
    // Calcular multiplicador basado en el streak
    let multiplier = 1.0;
    if (user.current_streak >= 29) multiplier = 3.0;
    else if (user.current_streak >= 22) multiplier = 2.5;
    else if (user.current_streak >= 15) multiplier = 2.0;
    else if (user.current_streak >= 8) multiplier = 1.5;
    
    // TEST DE REDIS ANTES DEL CHECK-IN
    console.log(`🔴 REDIS TEST: Verificando conexión Redis antes del check-in`);
    const { testConnection } = await import('@/services/redisService');
    const redisWorking = await testConnection();
    console.log(`🔴 REDIS TEST: Estado = ${redisWorking ? 'FUNCIONANDO' : 'FALLO'}`);
    
    // Calcular puntos basados en NFTs y bloquearlos en Redis
    console.log(`🎯 CHECK-IN: Iniciando cálculo de puntos para wallet ${wallet_address}`);
    const { totalPoints, eligibleNfts, listedNFTsMap } = await calculateNFTPoints(wallet_address, true);
    console.log(`🎯 CHECK-IN: Resultado - Puntos totales: ${totalPoints}, NFTs elegibles: ${eligibleNfts?.length || 0}`);
    
    // Contar cuántos NFTs están listados en el marketplace
    const listedNFTsCount = listedNFTsMap ? 
      Object.values(listedNFTsMap).filter(isListed => isListed).length : 0;
    
    if (listedNFTsCount > 0) {
      console.log(`Se encontraron ${listedNFTsCount} NFTs listados en el marketplace para la wallet ${wallet_address}`);
    }
    
    // Aplicar multiplicador al total de puntos de NFTs
    // Si no tiene NFTs, no asignar puntos
    const basePoints = totalPoints > 0 ? totalPoints : 0;
    
    // Calcular puntos ganados aplicando el multiplicador
    console.log(`Calculando puntos: Base=${basePoints}, Multiplicador=${multiplier}`);
    const pointsEarned = Math.round(basePoints * multiplier);
    console.log(`Puntos ganados después de aplicar multiplicador: ${pointsEarned}`);
    
    // Registrar el check-in
    const { data: checkIn, error: checkInError } = await supabase
      .from('check_ins')
      .insert({
        user_id: user.id,
        wallet_address: wallet_address.toLowerCase(),
        streak_count: user.current_streak,
        points_earned: pointsEarned,
        multiplier: multiplier,
        transaction_hash: transaction_hash || null
      })
      .select()
      .single();
    
    if (checkInError) throw checkInError;
    
// Los NFTs ya están bloqueados en Redis desde calculateNFTPoints
if (eligibleNfts && eligibleNfts.length > 0) {
  console.log(`Check-in completado con ${eligibleNfts.length} NFTs bloqueados en Redis para la wallet ${wallet_address}`);
}

// Registrar información sobre NFTs listados en el marketplace
if (listedNFTsCount > 0) {
  console.log(`${listedNFTsCount} NFTs listados en el marketplace no fueron utilizados para el check-in`);
}
    
    // Actualizar total_points
    const { error: pointsError } = await supabase
      .from('users')
      .update({
        total_points: user.total_points + pointsEarned
      })
      .eq('wallet_address', wallet_address.toLowerCase());
    
    if (pointsError) throw pointsError;
    
    // Obtener tokens reclamados para asegurarnos de preservar ese valor
    const { data: leaderboardData } = await supabase
      .from('leaderboard')
      .select('tokens_claimed')
      .eq('wallet_address', wallet_address.toLowerCase())
      .single();
      
    console.log('Datos del leaderboard actuales:', leaderboardData);
    
    // Obtener el número total de NFTs del usuario desde la base de datos
    const { data: allUserNfts } = await supabase
      .from('nfts')
      .select('token_id')
      .eq('wallet_address', wallet_address.toLowerCase());
    
    const totalNFTCount = allUserNfts?.length || 0;
    
    // Actualizar el leaderboard con la información correcta de streak y NFT count
    await updateLeaderboard(wallet_address, {
      best_streak: user.max_streak,
      current_streak: user.current_streak,
      points_earned: pointsEarned + (user.total_points || 0),
      last_active: new Date().toISOString(),
      nft_count: totalNFTCount,
      // Conservar tokens_claimed si existe, no lo actualizamos aquí
      tokens_claimed: leaderboardData?.tokens_claimed || 0
    });
    
    return NextResponse.json({
      success: true,
      user: {
        ...user,
        total_points: user.total_points + pointsEarned
      },
      check_in: checkIn,
      points_earned: pointsEarned,
      multiplier,
      streakBroken,
      marketplace_info: {
        listed_nfts_count: listedNFTsCount
      }
    });
    
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Failed to process check-in' }, { status: 500 });
  }
}
