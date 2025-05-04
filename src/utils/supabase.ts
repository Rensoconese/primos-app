import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Interface for leaderboard data
export interface LeaderboardData {
  wallet_address: string;
  user_name?: string | null;
  tokens_claimed?: number;
  points_earned?: number;
  best_streak?: number;
  current_streak?: number;
  nft_count?: number;
  last_active?: string;
  updated_at?: string;
  rank?: number;
}

// Configuración mejorada para evitar errores 406
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey
    }
  }
});

/**
 * Updates the leaderboard consistently, preserving existing values for fields not being updated
 * @param walletAddress The wallet address to update in the leaderboard
 * @param updates The partial data to update in the leaderboard
 * @returns Results of the operation
 */
export const updateLeaderboard = async (walletAddress: string, updates: Partial<LeaderboardData>) => {
  try {
    // 1. First get existing leaderboard entry data
    const { data: existingData, error: fetchError } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
    
    // 2. Prepare data for update, ensuring wallet_address is lowercase
    const leaderboardData: LeaderboardData = {
      wallet_address: walletAddress.toLowerCase(),
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
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    return { success: false, error };
  }
};

export const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('health_check').select('*').limit(1);
    
    if (error) throw error;
    
    console.log('Supabase connection successful:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Supabase connection error:', error);
    return { success: false, error };
  }
};
