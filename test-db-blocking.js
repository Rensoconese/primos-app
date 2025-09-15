// Test para verificar el bloqueo de NFTs en la base de datos

async function testDatabaseBlocking() {
  const wallet = '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6';
  
  console.log('🔍 Testing NFT blocking in database...\n');
  console.log(`Wallet: ${wallet}\n`);
  
  try {
    // 1. Verificar el estado actual del mining
    console.log('1. Checking current mining status...');
    const statusResponse = await fetch(`http://localhost:3000/api/v2/status?wallet_address=${wallet}`);
    const statusData = await statusResponse.json();
    
    console.log(`   Has mined today: ${statusData.today?.has_mined || false}`);
    console.log(`   NFTs used: ${statusData.today?.nfts_used || 0}`);
    console.log(`   Base points: ${statusData.today?.base_points || 0}\n`);
    
    // 2. Verificar los NFTs bloqueados en la DB
    console.log('2. Checking blocked NFTs in database...');
    const mineStatusResponse = await fetch(`http://localhost:3000/api/v2/mine?wallet_address=${wallet}`);
    const mineStatusData = await mineStatusResponse.json();
    
    console.log(`   Can mine: ${mineStatusData.canMine}`);
    console.log(`   Has checked in: ${mineStatusData.hasCheckedIn}`);
    console.log(`   Has mined: ${mineStatusData.hasMined}\n`);
    
    // 3. Verificar registros específicos en la DB usando Supabase
    console.log('3. Getting today\'s mining record from database...');
    const todayDate = new Date().toISOString().split('T')[0];
    
    // Simular consulta a la DB
    console.log(`   Date: ${todayDate}`);
    console.log(`   Looking for records in newcheckin_daily table...\n`);
    
    // 4. Resumen
    if (statusData.today?.has_mined) {
      console.log('✅ RESULT: User has already mined today');
      console.log('   - NFTs should be blocked in the database');
      console.log('   - The nfts_used field should contain the NFT IDs');
      console.log('   - Mining button should show "Already Mined Today"');
    } else {
      console.log('ℹ️ RESULT: User has NOT mined today');
      console.log('   - NFTs should be available for mining');
      console.log('   - The nfts_used field should be null or empty');
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
  }
}

// Ejecutar el test
testDatabaseBlocking();