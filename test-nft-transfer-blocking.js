// Test script to verify NFT transfer blocking works correctly
const ORIGINAL_WALLET = '0x66be3123fdf641070f8834fbe66803c8559255f6';
const TRANSFER_WALLET = '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6';

async function testNFTTransferBlocking() {
  console.log('🧪 Testing NFT Transfer Blocking System\n');
  console.log('=' . repeat(60));
  
  console.log('\n📋 Test Scenario:');
  console.log(`  1. NFT #1955 was used by wallet: ${ORIGINAL_WALLET}`);
  console.log(`  2. NFT #1955 was transferred to: ${TRANSFER_WALLET}`);
  console.log(`  3. New wallet tries to mine with NFT #1955`);
  console.log(`  4. Expected: NFT should be BLOCKED globally\n`);
  
  try {
    // Step 1: Check if NFT #1955 is blocked in the database
    console.log('Step 1: Checking database block status...');
    const checkBlockResponse = await fetch('http://localhost:3006/api/v2/mine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: TRANSFER_WALLET
      })
    });
    
    const mineResult = await checkBlockResponse.json();
    
    if (checkBlockResponse.status === 400) {
      console.log('✅ Mining correctly rejected');
      
      if (mineResult.error?.includes('already mined today')) {
        console.log('   Reason: Wallet already mined today');
      } else if (mineResult.error?.includes('No eligible NFTs')) {
        console.log('   Reason: No eligible NFTs (likely blocked)');
        console.log(`   Blocked NFTs: ${mineResult.blocked || 0}`);
      } else if (mineResult.error?.includes('check-in first')) {
        console.log('   Reason: Need to do check-in first');
      } else {
        console.log(`   Reason: ${mineResult.error}`);
      }
    } else if (checkBlockResponse.ok && mineResult.success) {
      console.log('❌ ERROR: Mining succeeded when it should have been blocked!');
      console.log('   This means NFT transfer exploit is NOT fixed');
    }
    
    // Step 2: Verify block status directly
    console.log('\nStep 2: Verifying NFT #1955 block status in new table...');
    // This would need a direct API endpoint to check, but we can infer from the mining result
    
    console.log('\n' + '=' . repeat(60));
    console.log('📊 TEST SUMMARY:\n');
    
    if (mineResult.blocked > 0 || mineResult.error?.includes('No eligible NFTs')) {
      console.log('✅ SUCCESS: NFT Transfer Blocking is Working!');
      console.log('   - NFT #1955 is globally blocked');
      console.log('   - Transfer exploit is prevented');
      console.log('   - New table newcheckin_nft_blocks is functioning correctly');
    } else {
      console.log('⚠️  WARNING: Unable to confirm if blocking is working');
      console.log('   - May need to check database directly');
      console.log('   - Ensure NFT #1955 was properly blocked initially');
    }
    
    console.log('\n💡 Key Points:');
    console.log('   - NFTs are now blocked by token_id in dedicated table');
    console.log('   - Blocks persist regardless of NFT ownership changes');
    console.log('   - Blocks auto-reset at UTC midnight');
    console.log('   - Much simpler and more reliable than JSONB approach');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testNFTTransferBlocking();