import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isSameUTCDay, getDayDifferenceUTC, getUTCDebugInfo } from '@/services/dateService';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { wallet_address, transaction_hash } = await req.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    
    // Verificar si el usuario existe
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletLower)
      .single();
    
    // Variable para detectar si se rompió la racha
    let streakBroken = false;
    
    // Si no existe, crearlo
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          wallet_address: walletLower,
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
      // Verificar si ya hizo check-in hoy
      const lastCheckInDate = new Date(user.last_check_in);
      const nowDate = new Date();
      
      // Log de depuración
      console.log('DEBUG UTC:', getUTCDebugInfo('Check-in API', nowDate));
      
      // Verificar si es el mismo día UTC
      if (isSameUTCDay(lastCheckInDate, nowDate)) {
        // Ya hizo check-in hoy, verificar si puede minar
        const { data: todayCheckIn } = await supabase
          .from('check_ins')
          .select('mining_completed')
          .eq('wallet_address', walletLower)
          .order('check_in_date', { ascending: false })
          .limit(1)
          .single();
        
        return NextResponse.json({ 
          error: 'Already checked in today',
          alreadyCheckedIn: true,
          canMine: todayCheckIn && !todayCheckIn.mining_completed,
          user
        }, { status: 400 });
      }
      
      // Calcular la diferencia en días para el streak
      const daysDiff = getDayDifferenceUTC(lastCheckInDate, nowDate);
      
      let newStreak;
      if (daysDiff === 1) {
        // Día consecutivo, incrementar racha
        newStreak = user.current_streak + 1;
      } else if (daysDiff > 1) {
        // Se rompió la racha, reiniciar a 1
        newStreak = 1;
        streakBroken = true;
      } else {
        // Este caso no debería ocurrir
        newStreak = user.current_streak;
      }
      
      // Actualizar usuario con nueva racha
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          current_streak: newStreak,
          max_streak: Math.max(newStreak, user.max_streak),
          total_check_ins: user.total_check_ins + 1,
          last_check_in: nowDate.toISOString()
        })
        .eq('wallet_address', walletLower)
        .select()
        .single();
      
      if (updateError) throw updateError;
      user = updatedUser;
    }
    
    // Calcular multiplicador (para mostrar al usuario, pero no se aplica aquí)
    let multiplier = 1.0;
    if (user.current_streak >= 29) multiplier = 3.0;
    else if (user.current_streak >= 22) multiplier = 2.5;
    else if (user.current_streak >= 15) multiplier = 2.0;
    else if (user.current_streak >= 8) multiplier = 1.5;
    
    // Registrar el check-in sin puntos (se calcularán al minar)
    const { data: checkIn, error: checkInError } = await supabase
      .from('check_ins')
      .insert({
        user_id: user.id,
        wallet_address: walletLower,
        streak_count: user.current_streak,
        points_earned: 0, // Se llenará cuando haga mining
        multiplier: multiplier,
        transaction_hash: transaction_hash || null,
        mining_completed: false // Nuevo campo
      })
      .select()
      .single();
    
    if (checkInError) throw checkInError;
    
    console.log(`✅ Check-in successful for ${walletLower}, streak: ${user.current_streak}, can mine: true`);
    
    return NextResponse.json({
      success: true,
      user: {
        ...user,
        current_streak: user.current_streak
      },
      check_in: checkIn,
      canMine: true, // Ahora puede minar
      streakBroken,
      currentMultiplier: multiplier,
      message: 'Check-in successful! You can now send primos to mine.'
    });
    
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json({ 
      error: 'Failed to process check-in' 
    }, { status: 500 });
  }
}
