import { NextRequest, NextResponse } from 'next/server';
import { 
  testConnection, 
  isRedisAvailable, 
  getNFTLockInfoV2,
  getRedisClient,
  getRedisUrl,
  getRedisToken
} from '@/services/redisService';
import { createClient } from '@/utils/supabase/server';

const NFT_CONTRACT = '0x23924869ff64ab205b3e3be388a373d75de74ebd';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const wallet_address = url.searchParams.get('wallet_address');
    
    console.log('🔍 Redis Status Check - Starting...');
    
    // 1. Check Redis configuration
    const redisUrl = getRedisUrl();
    const hasToken = !!getRedisToken();
    
    const configStatus = {
      hasUrl: !!redisUrl,
      urlPrefix: redisUrl ? redisUrl.substring(0, 30) + '...' : 'NOT SET',
      hasToken,
      isAvailable: isRedisAvailable()
    };
    
    console.log('Redis Config:', configStatus);
    
    // 2. Test Redis connection
    const connectionTest = await testConnection();
    console.log('Redis Connection Test:', connectionTest ? 'SUCCESS' : 'FAILED');
    
    // 3. If wallet provided, check their NFT locks
    let walletLocks = null;
    let todayMiningStatus = null;
    
    if (wallet_address) {
      const walletLower = wallet_address.toLowerCase();
      const todayDate = new Date().toISOString().split('T')[0];
      
      // Get user's NFTs from database
      const supabase = await createClient();
      const { data: userNfts } = await supabase
        .from('nfts')
        .select('token_id')
        .eq('wallet_address', walletLower);
      
      // Check today's mining status
      const { data: todayRecord } = await supabase
        .from('newcheckin_daily')
        .select('*')
        .eq('wallet_address', walletLower)
        .eq('action_date', todayDate)
        .single();
      
      todayMiningStatus = {
        date: todayDate,
        hasCheckedIn: todayRecord?.checkin_done || false,
        hasMined: todayRecord?.mining_done || false,
        nftsUsed: todayRecord?.nft_count || 0,
        basePoints: todayRecord?.base_points || 0
      };
      
      // Check lock status for each NFT
      if (userNfts && userNfts.length > 0) {
        walletLocks = [];
        
        for (const nft of userNfts) {
          const tokenId = String(nft.token_id);
          const lockInfo = await getNFTLockInfoV2(NFT_CONTRACT, tokenId);
          const v2Key = `v2:nft:locked:${NFT_CONTRACT.toLowerCase()}:${tokenId}`;
          
          // Try to get TTL if Redis is available
          let ttl = null;
          const client = getRedisClient();
          if (client && connectionTest) {
            try {
              ttl = await client.ttl(v2Key);
            } catch (e) {
              console.error('Error getting TTL:', e);
            }
          }
          
          walletLocks.push({
            tokenId,
            isLocked: !!lockInfo,
            lockedBy: lockInfo || null,
            v2Key,
            ttlSeconds: ttl,
            ttlHours: ttl ? Math.round(ttl / 3600 * 10) / 10 : null
          });
        }
      }
    }
    
    // 4. Get all V2 locked NFTs count
    let v2LockedCount = 0;
    const client = getRedisClient();
    if (client && connectionTest) {
      try {
        const keys = await client.keys('v2:nft:locked:*');
        v2LockedCount = keys.length;
        console.log(`Found ${v2LockedCount} V2 locked NFTs in Redis`);
      } catch (e) {
        console.error('Error counting V2 locks:', e);
      }
    }
    
    // 5. Check seconds until midnight UTC
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    const secondsUntilMidnight = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
    
    const response = {
      success: true,
      redis: {
        configured: configStatus,
        connected: connectionTest,
        v2LockedNFTsCount: v2LockedCount
      },
      wallet: wallet_address ? {
        address: wallet_address,
        todayMining: todayMiningStatus,
        nftLocks: walletLocks,
        totalNFTs: walletLocks?.length || 0,
        lockedNFTs: walletLocks?.filter(l => l.isLocked).length || 0
      } : null,
      utc: {
        currentTime: now.toISOString(),
        midnightUTC: tomorrow.toISOString(),
        secondsUntilReset: secondsUntilMidnight,
        hoursUntilReset: Math.round(secondsUntilMidnight / 360) / 10
      },
      debug: {
        nodeEnv: process.env.NODE_ENV,
        hasPublicRedisUrl: !!process.env.NEXT_PUBLIC_KV_REST_API_URL,
        hasPublicRedisToken: !!process.env.NEXT_PUBLIC_KV_REST_API_TOKEN,
        hasServerRedisUrl: !!process.env.KV_REST_API_URL,
        hasServerRedisToken: !!process.env.KV_REST_API_TOKEN
      }
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Redis Status Check Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check Redis status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}