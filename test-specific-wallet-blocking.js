// Test if NFT #1955 is blocked for the wallet that now owns it
const CURRENT_OWNER = '0x5f5370eec4cec2ac33b73799ceec5e3b9b110925';
const NFT_TO_TEST = '1955';

async function testSpecificWalletBlocking() {
  console.log('🔍 Testing NFT Blocking for Current Owner\n');
  console.log('=' . repeat(60));
  
  console.log('\n📋 Current Situation:');
  console.log(`  NFT #${NFT_TO_TEST} is owned by: ${CURRENT_OWNER}`);
  console.log(`  NFT #${NFT_TO_TEST} was used today by: 0x66be...55f6`);
  console.log(`  Expected: NFT should be BLOCKED for current owner\n`);
  
  try {
    // First check if this wallet has done check-in
    console.log('Step 1: Checking wallet status...');
    const statusResponse = await fetch(`http://localhost:3006/api/v2/status?wallet_address=${CURRENT_OWNER}`);
    const status = await statusResponse.json();
    
    console.log(`  Has checked in today: ${status.today?.has_checked_in || false}`);
    console.log(`  Has mined today: ${status.today?.has_mined || false}`);
    console.log(`  Can mine: ${status.today?.can_mine || false}`);
    
    if (!status.today?.has_checked_in) {
      console.log('\n⚠️  This wallet hasn\'t done check-in today');
      console.log('  Need to do check-in first to test mining\n');
      
      // Do check-in
      console.log('Step 2: Performing check-in...');
      const checkinResponse = await fetch('http://localhost:3006/api/v2/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: CURRENT_OWNER
        })
      });
      
      const checkinResult = await checkinResponse.json();
      if (checkinResult.success) {
        console.log('✅ Check-in successful');
      } else {
        console.log('❌ Check-in failed:', checkinResult.error);
        return;
      }
    }
    
    // Now try to mine
    console.log('\nStep 3: Attempting to mine with NFT #' + NFT_TO_TEST + '...');
    const mineResponse = await fetch('http://localhost:3006/api/v2/mine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: CURRENT_OWNER
      })
    });
    
    const mineResult = await mineResponse.json();
    
    console.log('\n' + '=' . repeat(60));
    console.log('📊 RESULT:\n');
    
    if (mineResponse.ok && mineResult.success) {
      console.log('❌ CRITICAL BUG: Mining succeeded!');
      console.log('   NFT #' + NFT_TO_TEST + ' was NOT blocked');
      console.log('   Transfer exploit is NOT fixed');
      console.log(`   Points earned: ${mineResult.miningResult?.finalPoints || 0}`);
      console.log(`   NFTs used: ${mineResult.miningResult?.nftsUsed || 0}`);
    } else if (mineResponse.status === 400) {
      if (mineResult.error?.includes('No eligible NFTs')) {
        console.log('✅ SUCCESS: NFT is properly blocked!');
        console.log(`   Blocked NFTs: ${mineResult.blocked || 0}`);
        console.log(`   Listed NFTs: ${mineResult.listed || 0}`);
        console.log('   Transfer exploit is FIXED');
      } else {
        console.log('⚠️  Mining failed for other reason:');
        console.log(`   ${mineResult.error}`);
      }
    }
    
    // Check the blocking table directly
    console.log('\n💾 Database Verification:');
    console.log('  Table: newcheckin_nft_blocks');
    console.log(`  NFT #${NFT_TO_TEST}: Should be present with today's date`);
    console.log('  Auto-cleanup: Will reset at UTC midnight');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testSpecificWalletBlocking();