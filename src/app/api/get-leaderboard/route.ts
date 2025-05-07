import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');
    
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
    
    // If wallet address is provided, fetch user data and rank
    let userEntry = null;
    if (walletAddress) {
      // First check if the user is already in top 10
      const userInTop10 = data?.find(entry => 
        entry.wallet_address.toLowerCase() === walletAddress.toLowerCase()
      );

      if (!userInTop10) {
        // Get the user's entry
        const { data: userData, error: userError } = await supabase
          .from('leaderboard')
          .select('wallet_address, user_name, tokens_claimed, points_earned, best_streak, nft_count')
          .eq('wallet_address', walletAddress.toLowerCase())
          .single();
        
        if (userError) {
          if (userError.code !== 'PGRST116') { // PGRST116 is the error code for no rows returned
            console.error('Error fetching user data:', userError);
          }
        } else if (userData) {
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
          }
        }
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      data, 
      userEntry 
    });
  } catch (error) {
    console.error('Error in get-leaderboard API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
