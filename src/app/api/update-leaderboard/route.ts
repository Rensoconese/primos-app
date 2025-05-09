import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { wallet_address, updates } = await request.json();
    
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }
    
    // Normalizar la dirección de la wallet a minúsculas
    const normalizedAddress = wallet_address.toLowerCase();
    
    console.log(`Updating leaderboard for wallet: ${normalizedAddress}`);
    console.log('Updates to apply:', updates);
    
    // 1. First get existing leaderboard entry data
    const { data: existingData, error: fetchError } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('wallet_address', normalizedAddress)
      .single();
    
    // 2. Prepare data for update
    const leaderboardData = {
      wallet_address: normalizedAddress,
      ...updates,
      updated_at: new Date().toISOString() // Always update timestamp
    };
    
    // 3. If existing data, preserve fields not included in the update
    if (existingData && !fetchError) {
      console.log('Existing leaderboard data found:', existingData);
      
      // For each field in existing data, if it's not in updates, preserve it
      if (existingData.tokens_claimed !== undefined && updates.tokens_claimed === undefined) 
        leaderboardData.tokens_claimed = existingData.tokens_claimed;
      
      // Si estamos actualizando tokens_claimed, verificar que el nuevo valor sea mayor o igual al existente
      if (updates.tokens_claimed !== undefined && existingData.tokens_claimed !== undefined) {
        console.log(`Comparing tokens_claimed: new=${updates.tokens_claimed}, existing=${existingData.tokens_claimed}`);
        
        // Si el nuevo valor es menor que el existente, verificar con la base de datos
        if (updates.tokens_claimed < existingData.tokens_claimed) {
          console.warn(`Warning: New tokens_claimed (${updates.tokens_claimed}) is less than existing (${existingData.tokens_claimed}). Verifying with database...`);
          
          // Obtener el total directamente de la base de datos usando la función RPC
          const { data: sumData, error: sumError } = await supabase
            .rpc('sum_tokens_received', { wallet_addr: normalizedAddress });
          
          if (!sumError && sumData !== null) {
            console.log(`Total from database SUM function: ${sumData}`);
            
            // Usar el valor de la suma directa de la base de datos
            leaderboardData.tokens_claimed = sumData;
            console.log(`Using database sum (${sumData}) for tokens_claimed`);
          } else {
            console.warn('Could not get sum from database, using provided value');
          }
        }
      }
      
      if (existingData.best_streak !== undefined && updates.best_streak === undefined) 
        leaderboardData.best_streak = existingData.best_streak;
      
      // Si estamos actualizando best_streak, asegurarse de que sea el máximo entre el valor existente y el nuevo
      if (updates.best_streak !== undefined && existingData.best_streak !== undefined) {
        leaderboardData.best_streak = Math.max(updates.best_streak, existingData.best_streak);
        console.log(`Using max best_streak: ${leaderboardData.best_streak}`);
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
      console.log('No existing leaderboard data found, creating new entry');
    }
    
    console.log('Final leaderboard data to upsert:', leaderboardData);
    
    // 4. Update leaderboard with combined data
    const { data, error } = await supabase
      .from('leaderboard')
      .upsert(leaderboardData, { onConflict: 'wallet_address' });
    
    if (error) {
      console.error('Error updating leaderboard:', error);
      return NextResponse.json({ error: 'Failed to update leaderboard' }, { status: 500 });
    }
    
    // 5. Verificar que la actualización se haya aplicado correctamente
    const { data: verifyData, error: verifyError } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('wallet_address', normalizedAddress)
      .single();
      
    if (verifyError) {
      console.error('Error verifying leaderboard update:', verifyError);
    } else {
      console.log('Leaderboard updated successfully:', verifyData);
    }
    
    return NextResponse.json({ success: true, data: verifyData || data });
  } catch (error) {
    console.error('Error in update-leaderboard API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
