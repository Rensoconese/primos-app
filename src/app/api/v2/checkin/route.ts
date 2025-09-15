import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isSameUTCDay, getDayDifferenceUTC, getUTCDebugInfo } from '@/services/dateService';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { wallet_address } = await req.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    const walletLower = wallet_address.toLowerCase();
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log('🔵 V2 CHECK-IN:', getUTCDebugInfo('v2/checkin', today));
    
    // Verificar si el usuario existe
    let { data: user, error: userError } = await supabase
      .from('newcheckin_users')
      .select('*')
      .eq('wallet_address', walletLower)
      .single();
    
    // Si no existe, crear usuario
    if (!user) {
      console.log(`Creating new user: ${walletLower}`);
      const { data: newUser, error: createError } = await supabase
        .from('newcheckin_users')
        .insert({
          wallet_address: walletLower,
          current_streak: 1,
          max_streak: 1,
          last_checkin_date: todayDate
        })
        .select()
        .single();
      
      if (createError) throw createError;
      user = newUser;
    } else {
      // Usuario existe, verificar si ya hizo check-in hoy
      const lastCheckIn = user.last_checkin_date ? new Date(user.last_checkin_date + 'T00:00:00Z') : null;
      
      if (lastCheckIn && isSameUTCDay(lastCheckIn, today)) {
        console.log(`User ${walletLower} already checked in today`);
        
        // Obtener el registro de hoy
        const { data: todayRecord } = await supabase
          .from('newcheckin_daily')
          .select('*')
          .eq('wallet_address', walletLower)
          .eq('action_date', todayDate)
          .single();
        
        return NextResponse.json({ 
          error: 'Already checked in today',
          alreadyCheckedIn: true,
          canMine: todayRecord ? !todayRecord.mining_done : false,
          streak: user.current_streak,
          user
        }, { status: 400 });
      }
      
      // Calcular nueva racha
      let newStreak = 1;
      let streakBroken = false;
      
      if (lastCheckIn) {
        const daysDiff = getDayDifferenceUTC(lastCheckIn, today);
        console.log(`Days since last check-in: ${daysDiff}`);
        
        if (daysDiff === 1) {
          // Día consecutivo
          newStreak = user.current_streak + 1;
        } else if (daysDiff > 1) {
          // Se rompió la racha
          newStreak = 1;
          streakBroken = true;
          console.log(`Streak broken! Was ${user.current_streak}, now 1`);
        }
      }
      
      // Actualizar usuario
      const { data: updatedUser, error: updateError } = await supabase
        .from('newcheckin_users')
        .update({
          current_streak: newStreak,
          max_streak: Math.max(newStreak, user.max_streak || 0),
          last_checkin_date: todayDate,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_address', walletLower)
        .select()
        .single();
      
      if (updateError) throw updateError;
      user = updatedUser;
    }
    
    // Crear o actualizar registro diario
    const { data: dailyRecord, error: dailyError } = await supabase
      .from('newcheckin_daily')
      .upsert({
        wallet_address: walletLower,
        action_date: todayDate,
        checkin_done: true,
        mining_done: false,
        streak_multiplier: getMultiplier(user.current_streak)
      }, {
        onConflict: 'wallet_address,action_date'
      })
      .select()
      .single();
    
    if (dailyError) {
      console.error('Error creating daily record:', dailyError);
      throw dailyError;
    }
    
    console.log(`✅ V2 Check-in successful for ${walletLower}, streak: ${user.current_streak}`);
    
    return NextResponse.json({
      success: true,
      user: {
        wallet_address: user.wallet_address,
        current_streak: user.current_streak,
        max_streak: user.max_streak
      },
      daily: dailyRecord,
      canMine: true,
      message: 'Check-in successful! You can now mine your rewards.'
    });
    
  } catch (error) {
    console.error('V2 Check-in error:', error);
    return NextResponse.json({ 
      error: 'Failed to process check-in' 
    }, { status: 500 });
  }
}

// GET endpoint para verificar estado
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
    
    // Obtener usuario
    const { data: user } = await supabase
      .from('newcheckin_users')
      .select('*')
      .eq('wallet_address', walletLower)
      .single();
    
    if (!user) {
      return NextResponse.json({
        hasUser: false,
        hasCheckedInToday: false,
        canMine: false,
        streak: 0
      });
    }
    
    // Obtener registro de hoy
    const { data: todayRecord } = await supabase
      .from('newcheckin_daily')
      .select('*')
      .eq('wallet_address', walletLower)
      .eq('action_date', todayDate)
      .single();
    
    return NextResponse.json({
      hasUser: true,
      hasCheckedInToday: todayRecord?.checkin_done || false,
      hasMined: todayRecord?.mining_done || false,
      canMine: todayRecord?.checkin_done && !todayRecord?.mining_done,
      streak: user.current_streak || 0,
      multiplier: getMultiplier(user.current_streak || 0)
    });
    
  } catch (error) {
    console.error('Error getting check-in status:', error);
    return NextResponse.json({
      error: 'Failed to get status'
    }, { status: 500 });
  }
}

// Helper function para calcular multiplicador
function getMultiplier(streak: number): number {
  if (streak >= 29) return 3.0;
  if (streak >= 22) return 2.5;
  if (streak >= 15) return 2.0;
  if (streak >= 8) return 1.5;
  return 1.0;
}