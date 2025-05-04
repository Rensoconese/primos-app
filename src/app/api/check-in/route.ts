import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ethers } from 'ethers';
import { calculateNFTPoints } from '@/services/nftService';
import { updateLeaderboard } from '@/utils/supabase';

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
      
      // Normalizar correctamente ambas fechas a medianoche UTC para comparación consistente
      const lastCheckInDate = new Date(user.last_check_in);
      // Crear fecha UTC normalizada a medianoche (00:00:00.000)
      const lastCheckInUTC = new Date(Date.UTC(
        lastCheckInDate.getUTCFullYear(),
        lastCheckInDate.getUTCMonth(),
        lastCheckInDate.getUTCDate(),
        0, 0, 0, 0
      ));
      
      const nowDate = new Date();
      // Crear fecha actual UTC normalizada a medianoche (00:00:00.000)
      const nowUTC = new Date(Date.UTC(
        nowDate.getUTCFullYear(),
        nowDate.getUTCMonth(),
        nowDate.getUTCDate(),
        0, 0, 0, 0
      ));
      
      console.log('DEBUG UTC Reset - Last check-in timestamp (UTC):', lastCheckInUTC.toISOString());
      console.log('DEBUG UTC Reset - Current date timestamp (UTC):', nowUTC.toISOString());
      console.log('DEBUG UTC Reset - Same UTC day?', lastCheckInUTC.getTime() === nowUTC.getTime());
      
      // Comparar los timestamps directamente para mayor precisión
      if (lastCheckInUTC.getTime() === nowUTC.getTime()) {
        return NextResponse.json({ 
          error: 'Already checked in today (UTC)',
          user
        }, { status: 400 });
      }
      
      // Calculamos la diferencia en días para el streak
      const timeDiff = Math.abs(nowUTC.getTime() - lastCheckInUTC.getTime());
      const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
      
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
    
    // Calcular puntos basados en NFTs
    const { totalPoints, eligibleNfts } = await calculateNFTPoints(wallet_address);
    
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
    
    // Registrar los NFTs usados en este check-in
    if (eligibleNfts && eligibleNfts.length > 0) {
      try {
        const nftUsageRecords = eligibleNfts.map(nft => ({
          token_id: nft.token_id,
          contract_address: nft.contract_address,
          wallet_address: wallet_address.toLowerCase(),
          check_in_id: checkIn.id,
          // usage_date se establece automáticamente como la fecha actual por el valor predeterminado
        }));

        const { error: usageError } = await supabase
          .from('nft_usage_tracking')
          .insert(nftUsageRecords);

        if (usageError) {
          // Si el error es por restricción única, significa que algún NFT ya fue usado hoy
          if (usageError.code === '23505') { // Código de error de PostgreSQL para violación de restricción única
            console.log('Algunos NFTs ya fueron usados hoy por otra wallet');
          } else {
            console.error('Error registering NFT usage:', usageError);
          }
        }
      } catch (error) {
        console.error('Error registering NFT usage:', error);
        // No fallamos el check-in si esto falla, solo registramos el error
      }
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
    
    // Actualizar el leaderboard con la información correcta de streak
    await updateLeaderboard(wallet_address, {
      best_streak: user.max_streak,
      current_streak: user.current_streak,
      points_earned: pointsEarned + (user.total_points || 0),
      last_active: new Date().toISOString(),
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
      streakBroken
    });
    
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Failed to process check-in' }, { status: 500 });
  }
}
