// Este servicio solo debe usarse en el servidor (API routes)
// No importar en componentes cliente
import { createClient } from '@/utils/supabase/server';

/**
 * Servicio para manejar el bloqueo de NFTs usando Supabase
 * Reemplaza la funcionalidad de Redis con una solución más confiable
 */

/**
 * Verifica si un NFT específico está bloqueado (fue usado hoy por cualquier wallet)
 * Usa la nueva tabla newcheckin_nft_blocks para verificación simple y rápida
 * @param tokenId - ID del NFT a verificar
 * @returns true si está bloqueado, false si está disponible
 */
export async function isNFTBlockedToday(tokenId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    // Usar la nueva función que verifica en la tabla dedicada
    const { data, error } = await supabase
      .rpc('newcheckin_is_nft_blocked', { p_token_id: tokenId });
    
    if (error) {
      console.error('Error checking NFT block status:', error);
      return false; // En caso de error, asumimos que NO está bloqueado
    }
    
    const isBlocked = data || false;
    if (isBlocked) {
      console.log(`NFT #${tokenId} is blocked (used today)`);
    }
    
    return isBlocked;
  } catch (error) {
    console.error('Error in isNFTBlockedToday:', error);
    return false;
  }
}

/**
 * Verifica múltiples NFTs de una vez para optimizar consultas
 * Usa la nueva tabla newcheckin_nft_blocks con verificación batch
 * @param tokenIds - Array de IDs de NFTs a verificar
 * @returns Map de tokenId -> isBlocked
 */
export async function checkMultipleNFTBlocks(tokenIds: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  
  // Inicializar todos como no bloqueados
  tokenIds.forEach(tokenId => result.set(tokenId, false));
  
  if (tokenIds.length === 0) {
    return result;
  }
  
  try {
    const supabase = await createClient();
    
    // Usar la nueva función que verifica en la tabla dedicada
    const { data, error } = await supabase
      .rpc('newcheckin_check_nfts_blocked', { p_token_ids: tokenIds });
    
    if (error) {
      console.error('Error checking multiple NFT blocks:', error);
      return result; // Retornar todos como no bloqueados en caso de error
    }
    
    // Procesar los resultados
    if (data && Array.isArray(data)) {
      data.forEach((item: { token_id: string; is_blocked: boolean }) => {
        result.set(item.token_id, item.is_blocked);
      });
    }
    
    const blockedCount = Array.from(result.values()).filter(blocked => blocked).length;
    console.log(`Checked ${tokenIds.length} NFTs: ${blockedCount} blocked, ${tokenIds.length - blockedCount} available`);
    
    return result;
  } catch (error) {
    console.error('Error in checkMultipleNFTBlocks:', error);
    return result;
  }
}

/**
 * Obtiene todos los NFTs bloqueados del día actual
 * OPTIMIZADO: Usa función stored procedure con agregación en DB
 * @returns Array de token IDs bloqueados
 */
export async function getAllBlockedNFTsToday(): Promise<string[]> {
  try {
    const supabase = await createClient();
    
    // Usar la función optimizada que agrega en la DB
    const { data, error } = await supabase
      .rpc('get_all_blocked_nfts_today');
    
    if (error) {
      console.error('Error getting all blocked NFTs:', error);
      return [];
    }
    
    // La función retorna un JSONB array
    if (data && Array.isArray(data)) {
      return data.map(id => String(id));
    }
    
    return [];
  } catch (error) {
    console.error('Error in getAllBlockedNFTsToday:', error);
    return [];
  }
}

/**
 * Verifica si un NFT específico fue usado por una wallet específica hoy
 * @param tokenId - ID del NFT
 * @param walletAddress - Dirección de la wallet
 * @returns true si esa wallet usó ese NFT hoy
 */
export async function wasNFTUsedByWalletToday(tokenId: string, walletAddress: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const todayDate = new Date().toISOString().split('T')[0];
    const walletLower = walletAddress.toLowerCase();
    
    const { data, error } = await supabase
      .from('newcheckin_daily')
      .select('nfts_used')
      .eq('wallet_address', walletLower)
      .eq('action_date', todayDate)
      .eq('mining_done', true)
      .single();
    
    if (error || !data) {
      return false;
    }
    
    if (data.nfts_used && Array.isArray(data.nfts_used)) {
      return data.nfts_used.includes(tokenId);
    }
    
    return false;
  } catch (error) {
    console.error('Error in wasNFTUsedByWalletToday:', error);
    return false;
  }
}

/**
 * Bloquea NFTs después de que se usaron para minar
 * @param tokenIds - Array de IDs de NFTs a bloquear
 * @param walletAddress - Dirección de la wallet que usó los NFTs
 * @returns true si se bloquearon exitosamente
 */
export async function blockNFTsAfterMining(tokenIds: string[], walletAddress: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const walletLower = walletAddress.toLowerCase();
    
    console.log(`Blocking ${tokenIds.length} NFTs for wallet ${walletLower}`);
    
    // Llamar a la función que inserta en la tabla newcheckin_nft_blocks
    const { error } = await supabase
      .rpc('newcheckin_block_nfts', { 
        p_token_ids: tokenIds,
        p_wallet: walletLower
      });
    
    if (error) {
      console.error('Error blocking NFTs:', error);
      return false;
    }
    
    console.log(`✅ Successfully blocked NFTs: ${tokenIds.join(', ')}`);
    return true;
  } catch (error) {
    console.error('Error in blockNFTsAfterMining:', error);
    return false;
  }
}

export default {
  isNFTBlockedToday,
  checkMultipleNFTBlocks,
  getAllBlockedNFTsToday,
  wasNFTUsedByWalletToday,
  blockNFTsAfterMining
};