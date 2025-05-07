import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { wallet_address, updates } = await request.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    // 1. First get existing leaderboard entry data
    const { data: existingData, error: fetchError } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('wallet_address', wallet_address.toLowerCase())
      .single();
    
    // 2. Prepare data for update, ensuring wallet_address is lowercase
    const leaderboardData = {
      wallet_address: wallet_address.toLowerCase(),
      ...updates,
      updated_at: new Date().toISOString() // Always update timestamp
    };
    
    // 3. If existing data, preserve fields not included in the update
    if (existingData && !fetchError) {
      // For each field in existing data, if it's not in updates, preserve it
      if (existingData.tokens_claimed !== undefined && updates.tokens_claimed === undefined) 
        leaderboardData.tokens_claimed = existingData.tokens_claimed;
      
      if (existingData.best_streak !== undefined && updates.best_streak === undefined) 
        leaderboardData.best_streak = existingData.best_streak;
      
      if (existingData.current_streak !== undefined && updates.current_streak === undefined) 
        leaderboardData.current_streak = existingData.current_streak;
      
      if (existingData.nft_count !== undefined && updates.nft_count === undefined) 
        leaderboardData.nft_count = existingData.nft_count;
      
      if (existingData.points_earned !== undefined && updates.points_earned === undefined) 
        leaderboardData.points_earned = existingData.points_earned;
      
      if (existingData.user_name !== undefined && updates.user_name === undefined) 
        leaderboardData.user_name = existingData.user_name;
    }
    
    // 4. Update leaderboard with combined data
    const { data, error } = await supabase
      .from('leaderboard')
      .upsert(leaderboardData, { onConflict: 'wallet_address' });
    
    if (error) {
      console.error('Error updating leaderboard:', error);
      return NextResponse.json({ error: 'Failed to update leaderboard' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in update-leaderboard API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
