import { supabase } from '@/utils/supabase';

/**
 * Interface for leaderboard data
 */
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

/**
 * Updates the leaderboard consistently, preserving existing values for fields not being updated
 * @param walletAddress The wallet address to update in the leaderboard
 * @param updates The partial data to update in the leaderboard
 * @returns Results of the operation
 */
export const updateLeaderboard = async (walletAddress: string, updates: Partial<LeaderboardData>) => {
  try {
    // Usar la API en lugar de actualizar directamente desde el cliente
    const response = await fetch('/api/update-leaderboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        updates
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update leaderboard');
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    return { success: false, error };
  }
};

/**
 * Updates the leaderboard streak for a user
 * @param walletAddress The wallet address to update
 * @param currentStreak The current streak value
 * @returns Results of the operation
 */
export const updateLeaderboardStreak = async (walletAddress: string, currentStreak: number) => {
  return updateLeaderboard(walletAddress, {
    current_streak: currentStreak,
    best_streak: currentStreak, // This will be overridden if existing best_streak is higher
    last_active: new Date().toISOString()
  });
};

/**
 * Gets the leaderboard data for a specific wallet address
 * @param walletAddress The wallet address to get data for
 * @returns The leaderboard data for the wallet address
 */
export const getLeaderboardData = async (walletAddress: string) => {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('Error getting leaderboard data:', error);
    return { success: false, error };
  }
};

/**
 * Gets the top leaderboard entries
 * @param limit The number of entries to get (default: 10)
 * @returns The top leaderboard entries
 */
export const getTopLeaderboard = async (limit: number = 10) => {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('tokens_claimed', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('Error getting top leaderboard:', error);
    return { success: false, error };
  }
};

export default {
  updateLeaderboard,
  updateLeaderboardStreak,
  getLeaderboardData,
  getTopLeaderboard
};
