const { Redis } = require('@upstash/redis');

// Configuración de Redis
const redis = new Redis({
  url: 'https://smart-frog-23999.upstash.io',
  token: 'AV2_AAIjcDFlNTA6NzFlZWMyMWE0ODk4OTA4NTUzOWJmN2MyODgzMHAxMA'
});

async function testRedis() {
  console.log('🔍 Testing Redis connection and V2 locks...\n');
  
  try {
    // 1. Test connection
    await redis.ping();
    console.log('✅ Redis connection successful\n');
    
    // 2. Look for V2 locked NFTs
    const v2Keys = await redis.keys('v2:nft:locked:*');
    console.log(`📦 Found ${v2Keys.length} V2 locked NFTs\n`);
    
    if (v2Keys.length > 0) {
      console.log('V2 Locked NFTs:');
      for (const key of v2Keys.slice(0, 10)) { // Show max 10
        const value = await redis.get(key);
        const ttl = await redis.ttl(key);
        console.log(`  ${key}`);
        console.log(`    Locked by: ${value}`);
        console.log(`    TTL: ${ttl} seconds (${Math.round(ttl/3600)} hours)\n`);
      }
    }
    
    // 3. Check specific NFT for wallet 0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6
    const wallet = '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6'.toLowerCase();
    const contract = '0x23924869ff64ab205b3e3be388a373d75de74ebd'.toLowerCase();
    
    console.log(`\n🔍 Checking NFTs for wallet ${wallet}:`);
    
    // Check a few token IDs that might be owned by this wallet
    const tokenIds = ['1733', '2228', '1', '2', '3', '4', '5'];
    let found = false;
    
    for (const tokenId of tokenIds) {
      const key = `v2:nft:locked:${contract}:${tokenId}`;
      const lockInfo = await redis.get(key);
      if (lockInfo) {
        console.log(`  NFT #${tokenId}: LOCKED by ${lockInfo}`);
        if (lockInfo === wallet) {
          found = true;
        }
      }
    }
    
    if (!found) {
      console.log('  No locked NFTs found for this wallet in the checked IDs');
      console.log('  (This wallet might own different NFT IDs)');
    }
    
    // 4. Check old format keys too (without v2: prefix)
    console.log('\n🔍 Checking old format locks:');
    const oldKeys = await redis.keys('nft:locked:*');
    console.log(`Found ${oldKeys.length} old format locked NFTs`);
    
  } catch (error) {
    console.error('❌ Redis error:', error.message);
  }
}

testRedis();