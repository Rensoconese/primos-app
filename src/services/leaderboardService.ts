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
    // Actualizar directamente usando Supabase en lugar de la API
    console.log(`Actualizando leaderboard para wallet: ${walletAddress.toLowerCase()}`);
    console.log('Actualizaciones a aplicar:', updates);
    
    // 1. Primero obtener datos existentes del leaderboard
    const { data: existingData, error: fetchError } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
    
    // 2. Preparar datos para actualización
    const leaderboardData = {
      wallet_address: walletAddress.toLowerCase(),
      ...updates,
      updated_at: new Date().toISOString() // Siempre actualizar timestamp
    };
    
    // 3. Si hay datos existentes, preservar campos que no están incluidos en la actualización
    if (existingData && !fetchError) {
      console.log('Datos existentes del leaderboard encontrados:', existingData);
      
      // Para cada campo en los datos existentes, si no está en las actualizaciones, preservarlo
      if (existingData.tokens_claimed !== undefined && updates.tokens_claimed === undefined) 
        leaderboardData.tokens_claimed = existingData.tokens_claimed;
      
      // Si estamos actualizando tokens_claimed, verificar que el nuevo valor sea mayor o igual al existente
      if (updates.tokens_claimed !== undefined && existingData.tokens_claimed !== undefined) {
        console.log(`Comparando tokens_claimed: nuevo=${updates.tokens_claimed}, existente=${existingData.tokens_claimed}`);
        
        // Si el nuevo valor es menor que el existente, usar el existente
        if (updates.tokens_claimed < existingData.tokens_claimed) {
          console.warn(`Advertencia: Nuevo tokens_claimed (${updates.tokens_claimed}) es menor que el existente (${existingData.tokens_claimed}). Usando el valor existente.`);
          leaderboardData.tokens_claimed = existingData.tokens_claimed;
        }
      }
      
      if (existingData.best_streak !== undefined && updates.best_streak === undefined) 
        leaderboardData.best_streak = existingData.best_streak;
      
      // Si estamos actualizando best_streak, asegurarse de que sea el máximo entre el valor existente y el nuevo
      if (updates.best_streak !== undefined && existingData.best_streak !== undefined) {
        leaderboardData.best_streak = Math.max(updates.best_streak, existingData.best_streak);
        console.log(`Usando max best_streak: ${leaderboardData.best_streak}`);
      }
      
      if (existingData.current_streak !== undefined && updates.current_streak === undefined) 
        leaderboardData.current_streak = existingData.current_streak;
      
      if (existingData.nft_count !== undefined && updates.nft_count === undefined) 
        leaderboardData.nft_count = existingData.nft_count;
      
      if (existingData.points_earned !== undefined && updates.points_earned === undefined) 
        leaderboardData.points_earned = existingData.points_earned;
      
      if (existingData.user_name !== undefined && updates.user_name === undefined) 
        leaderboardData.user_name = existingData.user_name;
    } else {
      console.log('No se encontraron datos existentes del leaderboard, creando nueva entrada');
    }
    
    console.log('Datos finales del leaderboard para upsert:', leaderboardData);
    
    // 4. Actualizar leaderboard con datos combinados
    const { data, error } = await supabase
      .from('leaderboard')
      .upsert(leaderboardData, { onConflict: 'wallet_address' });
    
    if (error) {
      console.error('Error actualizando leaderboard:', error);
      throw new Error(`Error actualizando leaderboard: ${error.message}`);
    }
    
    // 5. Verificar que la actualización se haya aplicado correctamente
    const { data: verifyData, error: verifyError } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
      
    if (verifyError) {
      console.error('Error verificando actualización del leaderboard:', verifyError);
    } else {
      console.log('Leaderboard actualizado correctamente:', verifyData);
    }
    
    return { success: true, data: verifyData || data };
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
