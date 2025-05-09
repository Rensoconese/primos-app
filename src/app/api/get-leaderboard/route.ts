import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');
    
    console.log(`GET /api/get-leaderboard - Wallet address: ${walletAddress || 'none'}`);
    
    // Si se proporciona una dirección de wallet, verificar primero si necesitamos actualizar sus tokens reclamados
    if (walletAddress) {
      const normalizedAddress = walletAddress.toLowerCase();
      
      // Obtener los datos actuales del leaderboard para el usuario
      const { data: currentData, error: currentError } = await supabase
        .from('leaderboard')
        .select('tokens_claimed')
        .eq('wallet_address', normalizedAddress)
        .single();
      
      // Obtener el total de tokens reclamados directamente de la tabla rewards
      const { data: sumData, error: sumError } = await supabase
        .rpc('sum_tokens_received', { wallet_addr: normalizedAddress });
      
      // Si tenemos ambos datos y hay una discrepancia, actualizar el leaderboard
      if (!currentError && currentData && !sumError && sumData !== null) {
        console.log(`Current tokens_claimed in leaderboard: ${currentData.tokens_claimed}`);
        console.log(`Total from database SUM function: ${sumData}`);
        
        if (currentData.tokens_claimed !== sumData) {
          console.log(`Discrepancy detected: leaderboard=${currentData.tokens_claimed}, actual=${sumData}. Updating leaderboard...`);
          
          // Actualizar el leaderboard con el valor correcto
          const { error: updateError } = await supabase
            .from('leaderboard')
            .update({ tokens_claimed: sumData, updated_at: new Date().toISOString() })
            .eq('wallet_address', normalizedAddress);
          
          if (updateError) {
            console.error('Error updating leaderboard with correct tokens_claimed:', updateError);
          } else {
            console.log(`Leaderboard updated with correct tokens_claimed: ${sumData}`);
          }
        }
      }
    }
    
    // Fetch top 10 for the leaderboard
    const { data, error } = await supabase
      .from('leaderboard')
      .select('wallet_address, user_name, tokens_claimed, points_earned, best_streak, nft_count')
      .order('tokens_claimed', { ascending: false })
      .limit(10);
      
    if (error) {
      console.error('Error fetching leaderboard:', error);
      return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
    }
    
    console.log(`Top 10 leaderboard entries fetched: ${data?.length || 0}`);
    
    // If wallet address is provided, fetch user data and rank
    let userEntry = null;
    if (walletAddress) {
      const normalizedAddress = walletAddress.toLowerCase();
      
      // First check if the user is already in top 10
      const userInTop10 = data?.find(entry => 
        entry.wallet_address.toLowerCase() === normalizedAddress
      );

      if (userInTop10) {
        console.log(`User ${normalizedAddress} found in top 10`);
      } else {
        console.log(`User ${normalizedAddress} not in top 10, fetching individual data...`);
        
        // Get the user's entry
        const { data: userData, error: userError } = await supabase
          .from('leaderboard')
          .select('wallet_address, user_name, tokens_claimed, points_earned, best_streak, nft_count')
          .eq('wallet_address', normalizedAddress)
          .single();
        
        if (userError) {
          if (userError.code !== 'PGRST116') { // PGRST116 is the error code for no rows returned
            console.error('Error fetching user data:', userError);
          } else {
            console.log(`No leaderboard entry found for user ${normalizedAddress}`);
          }
        } else if (userData) {
          console.log(`User data found: tokens_claimed=${userData.tokens_claimed}`);
          
          // Get the user rank
          const { count, error: countError } = await supabase
            .from('leaderboard')
            .select('wallet_address', { count: 'exact', head: true })
            .gte('tokens_claimed', userData.tokens_claimed);
          
          if (countError) {
            console.error('Error getting user rank:', countError);
          } else {
            userEntry = {
              ...userData,
              rank: count || 0
            };
            console.log(`User rank calculated: ${count || 0}`);
          }
        }
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      data, 
      userEntry,
      timestamp: new Date().toISOString() // Añadir timestamp para depuración
    });
  } catch (error) {
    console.error('Error in get-leaderboard API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
