// Script de prueba para verificar el filtrado de NFTs del marketplace
// Este script simula el proceso de check-in para una wallet específica

const test_wallet = process.argv[2];

if (!test_wallet) {
  console.log('Uso: node test-marketplace-filter.js <wallet_address>');
  process.exit(1);
}

console.log(`🧪 Probando filtrado de marketplace para wallet: ${test_wallet}`);

async function testMarketplaceFilter() {
  try {
    // Simular llamada a calculateNFTPoints (sin bloquear NFTs)
    const response = await fetch(`http://localhost:3000/api/user-data?wallet_address=${test_wallet.toLowerCase()}`);
    const userData = await response.json();
    
    console.log('📊 Datos del usuario:', {
      total_points: userData.data?.total_points,
      current_streak: userData.data?.current_streak
    });

    // Obtener NFTs de la wallet
    const nftsResponse = await fetch(`http://localhost:3000/api/check-nft-listing?wallet_address=${test_wallet.toLowerCase()}&token_id=1`);
    const testNft = await nftsResponse.json();
    
    console.log('🖼️ Test NFT #1:', {
      isListed: testNft.isListed,
      message: testNft.message
    });

    // Probar el cálculo directo 
    console.log('\n🧮 Simulando cálculo de puntos...');
    
    // Aquí deberíamos hacer una llamada simulada al calculateNFTPoints
    // Pero como no podemos importar directamente, usaremos logs del servidor
    
    console.log('\n⚠️  Para verificar completamente:');
    console.log('1. Revisa los logs del servidor durante un check-in');
    console.log('2. Busca los mensajes que muestran NFTs bloqueados por marketplace');
    console.log('3. Verifica que los puntos calculados excluyan esos NFTs');
    
  } catch (error) {
    console.error('❌ Error en test:', error.message);
  }
}

testMarketplaceFilter();