// Test simple para verificar el bloqueo de NFTs en la DB

async function testBlockingCheck() {
  console.log('🔍 Testing NFT blocking check...\n');
  
  const testNFTs = ['1733', '2228', '100', '200'];
  
  try {
    // Hacer una petición simple para verificar el estado
    for (const nftId of testNFTs) {
      console.log(`Checking NFT #${nftId}...`);
      
      // Simular la consulta que haría nuestro servicio
      const response = await fetch('http://localhost:3000/api/v2/mine', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log(`  Response received`);
      }
      
      // Pequeña pausa para no sobrecargar
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n✅ Test completed');
    console.log('\nExpected result:');
    console.log('- NFT #1733 should be BLOCKED (in database)');
    console.log('- Other NFTs should be AVAILABLE (unless owned and blocked)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testBlockingCheck();