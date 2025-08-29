import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { normalizeToUTCMidnight, isSameUTCDay, getDayDifferenceUTC, getUTCDebugInfo } from '@/services/dateService';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  try {
    // Get the wallet address from the URL parameters
    const url = new URL(req.url);
    const walletAddress = url.searchParams.get('wallet_address');
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Query the users table
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
      
    // If we have data, add UTC check-in status
    if (data && data.last_check_in) {
      const lastCheckInDate = new Date(data.last_check_in);
      const nowDate = new Date();
      
      // Normalizar fechas a medianoche UTC usando dateService
      const lastCheckInUTC = normalizeToUTCMidnight(lastCheckInDate);
      const nowUTC = normalizeToUTCMidnight(nowDate);
      
      // Log de depuración con información detallada
      console.log('DEBUG UTC:', getUTCDebugInfo('User-Data API', nowDate));
      
      // Verificar si es el mismo día UTC
      data.checked_in_today_utc = isSameUTCDay(lastCheckInDate, nowDate);
      
      // Calcular diferencia en días
      const daysDiff = getDayDifferenceUTC(lastCheckInDate, nowDate);
      
      // Calcular diferencia en horas (aproximada)
      const timeDiff = Math.abs(nowDate.getTime() - lastCheckInDate.getTime());
      const hoursDiff = timeDiff / (1000 * 3600);
      
      data.hours_since_last_checkin = hoursDiff;
      data.days_since_last_checkin = daysDiff;
      
      // Check if more than one day has passed (streak broken)
      if (daysDiff > 1 && data.current_streak > 0) {
        // If streak should be broken and we're displaying stale data
        console.log('Streak should be reset - days since last check-in:', daysDiff);
        
        // Reset streak to 0 in real-time
        data.current_streak = 0;
        data.streak_broken = true;
        
        // Also update the database to make sure it's correct for next time
        const { error: updateError } = await supabase
          .from('users')
          .update({
            current_streak: 0
          })
          .eq('wallet_address', walletAddress.toLowerCase());
          
        if (updateError) {
          console.error('Error updating broken streak:', updateError);
        }
      } else {
        // Ensure streak_broken is false if the streak is positive
        if (data.current_streak > 0) {
          data.streak_broken = false;
        }
      }
      
      // Primero verificar si es un nuevo día UTC
      if (!data.checked_in_today_utc) {
        // Si es un nuevo día UTC, permitir check-in independientemente de las horas transcurridas
        data.can_checkin = true;
        data.hours_remaining = 0;
        console.log('User can check in - new UTC day detected', {
          wallet: walletAddress,
          lastCheckIn: data.last_check_in,
          checked_in_today_utc: data.checked_in_today_utc,
          can_checkin: data.can_checkin,
          hours_remaining: data.hours_remaining
        });
      } else {
        // Si es el mismo día UTC, no permitir check-in
        data.can_checkin = false;
        data.hours_remaining = Math.ceil(24 - hoursDiff);
        console.log('User cannot check in - same UTC day', {
          wallet: walletAddress,
          lastCheckIn: data.last_check_in,
          checked_in_today_utc: data.checked_in_today_utc,
          can_checkin: data.can_checkin,
          hours_remaining: data.hours_remaining
        });
      }
    } else if (data) {
      // Handle users who have never checked in (last_check_in is null)
      data.checked_in_today_utc = false;
      data.can_checkin = true;
      data.hours_remaining = 0;
      data.hours_since_last_checkin = null;
      data.days_since_last_checkin = null;
      data.streak_broken = false;
      
      console.log('User has never checked in - allowing first check-in', {
        wallet: walletAddress,
        lastCheckIn: data.last_check_in,
        checked_in_today_utc: data.checked_in_today_utc,
        can_checkin: data.can_checkin,
        hours_remaining: data.hours_remaining
      });
    }
      
    if (error) {
      // If user not found, return empty data instead of error
      if (error.code === 'PGRST116') {
        return NextResponse.json({ data: null });
      }
      
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: error.message || 'Database error' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ data });
  } catch (err) {
    console.error('Server error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
