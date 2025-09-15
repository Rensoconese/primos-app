import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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
    
    console.log(`🔵 V2 STATUS: Fetching for ${walletLower}`);
    
    // 1. Obtener información del usuario
    const { data: user } = await supabase
      .from('newcheckin_users')
      .select('*')
      .eq('wallet_address', walletLower)
      .single();
    
    // 2. Obtener actividad de hoy
    const { data: todayActivity } = await supabase
      .from('newcheckin_daily')
      .select('*')
      .eq('wallet_address', walletLower)
      .eq('action_date', todayDate)
      .single();
    
    // 3. Obtener claims pendientes
    const { data: pendingClaims } = await supabase
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
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    // 4. Obtener últimos claims procesados
    const { data: recentClaims } = await supabase
      .from('newcheckin_claim_history')
      .select('*')
      .eq('wallet_address', walletLower)
      .order('created_at', { ascending: false })
      .limit(5);
    
    // 5. Obtener resumen de actividad (últimos 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    const { data: weekActivity } = await supabase
      .from('newcheckin_daily')
      .select('*')
      .eq('wallet_address', walletLower)
      .gte('action_date', sevenDaysAgoStr)
      .order('action_date', { ascending: false });
    
    // 6. Calcular estadísticas
    const totalPendingPoints = pendingClaims?.reduce((sum, claim) => sum + claim.points_to_claim, 0) || 0;
    const totalClaimedPoints = recentClaims?.reduce((sum, claim) => sum + claim.points_claimed, 0) || 0;
    const weeklyMiningDays = weekActivity?.filter(day => day.mining_done).length || 0;
    
    // 7. Determinar siguiente multiplicador (si mantiene racha)
    let nextMultiplier = 1.0;
    if (user) {
      const nextStreak = user.current_streak + 1;
      if (nextStreak >= 29) nextMultiplier = 3.0;
      else if (nextStreak >= 22) nextMultiplier = 2.5;
      else if (nextStreak >= 15) nextMultiplier = 2.0;
      else if (nextStreak >= 8) nextMultiplier = 1.5;
    }
    
    // 8. NFT count (aproximado basado en últimos mining)
    const lastMining = weekActivity?.find(day => day.mining_done && day.nft_count > 0);
    const estimatedNftCount = lastMining?.nft_count || 0;
    
    // Construir respuesta completa
    const response = {
      user: user ? {
        wallet_address: user.wallet_address,
        current_streak: user.current_streak || 0,
        max_streak: user.max_streak || 0,
        last_checkin: user.last_checkin_date,
        member_since: user.created_at
      } : null,
      
      today: {
        date: todayDate,
        has_checked_in: todayActivity?.checkin_done || false,
        has_mined: todayActivity?.mining_done || false,
        can_mine: (todayActivity?.checkin_done && !todayActivity?.mining_done) || false,
        nfts_used: todayActivity?.nft_count || 0,
        base_points: todayActivity?.base_points || 0,
        multiplier: todayActivity?.streak_multiplier || 1.0,
        points_earned: todayActivity?.mining_done ? 
          Math.round((todayActivity.base_points || 0) * (todayActivity.streak_multiplier || 1)) : 0
      },
      
      pending_claims: {
        count: pendingClaims?.length || 0,
        total_points: totalPendingPoints,
        oldest_date: pendingClaims?.[pendingClaims.length - 1]?.created_at || null,
        newest_date: pendingClaims?.[0]?.created_at || null,
        claims: pendingClaims?.slice(0, 10) || [] // Mostrar máximo 10
      },
      
      claim_history: {
        recent_claims: recentClaims?.length || 0,
        total_claimed_recently: totalClaimedPoints,
        last_claim_date: recentClaims?.[0]?.created_at || null,
        history: recentClaims || []
      },
      
      weekly_summary: {
        days_active: weekActivity?.length || 0,
        days_mined: weeklyMiningDays,
        total_base_points: weekActivity?.reduce((sum, day) => sum + (day.base_points || 0), 0) || 0,
        activity: weekActivity || []
      },
      
      projections: {
        next_multiplier: nextMultiplier,
        streak_to_next_tier: getStreakToNextTier(user?.current_streak || 0),
        estimated_nft_count: estimatedNftCount
      }
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('V2 Status error:', error);
    return NextResponse.json({
      error: 'Failed to fetch user status'
    }, { status: 500 });
  }
}

// Helper function para calcular días hasta siguiente tier
function getStreakToNextTier(currentStreak: number): { tier: string, days_needed: number } {
  if (currentStreak < 8) {
    return { tier: '1.5x', days_needed: 8 - currentStreak };
  } else if (currentStreak < 15) {
    return { tier: '2.0x', days_needed: 15 - currentStreak };
  } else if (currentStreak < 22) {
    return { tier: '2.5x', days_needed: 22 - currentStreak };
  } else if (currentStreak < 29) {
    return { tier: '3.0x', days_needed: 29 - currentStreak };
  } else {
    return { tier: 'MAX', days_needed: 0 };
  }
}