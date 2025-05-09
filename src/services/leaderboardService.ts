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
    console.log(`Actualizando leaderboard para wallet: ${walletAddress.toLowerCase()}`);
    console.log('Actualizaciones a aplicar:', updates);
    
    // Obtener la URL base del navegador (para asegurar que funcione en cualquier entorno)
    const baseUrl = window.location.origin;
    console.log(`Base URL: ${baseUrl}`);
    
    // Usar la API para actualizar el leaderboard (tiene permisos de servidor)
    const response = await fetch(`${baseUrl}/api/update-leaderboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        updates
      }),
    });
    
    // Verificar si la respuesta es exitosa
    if (!response.ok) {
      // Capturar el texto de la respuesta para diagnóstico
      let errorMessage = `Error HTTP ${response.status}`;
      
      try {
        // Intentar parsear como JSON
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (jsonError) {
        // Si no es JSON, capturar como texto
        try {
          const textError = await response.text();
          errorMessage = `${errorMessage}: ${textError.substring(0, 100)}...`;
        } catch (textError) {
          // Si tampoco podemos obtener el texto, usar el mensaje genérico
          console.error('No se pudo obtener detalles del error:', textError);
        }
      }
      
      throw new Error(errorMessage);
    }
    
    // Parsear la respuesta exitosa
    const data = await response.json();
    console.log('Respuesta de actualización del leaderboard:', data);
    
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
