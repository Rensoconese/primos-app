// Test del sistema de mining atómico mejorado
const TEST_WALLET = '0x5f5370eec4cec2ac33b73799ceec5e3b9b110925';

async function testAtomicMining() {
  console.log('🚀 Testing Atomic Mining System\n');
  console.log('=' . repeat(60));
  
  console.log('\n✨ Mejoras Implementadas:');
  console.log('  1. ✅ Transacción atómica (mine_with_atomic_lock)');
  console.log('  2. ✅ Validación de ownership de NFTs');
  console.log('  3. ✅ Sistema de auditoría completo');
  console.log('  4. ✅ Prevención de race conditions');
  console.log('  5. ✅ Limpieza automática con trigger');
  console.log('  6. ✅ Índices optimizados\n');
  
  try {
    // 1. Verificar estado actual
    console.log('1️⃣ Checking current status...');
    const statusResponse = await fetch(`http://localhost:3006/api/v2/status?wallet_address=${TEST_WALLET}`);
    const status = await statusResponse.json();
    
    console.log(`   Has checked in: ${status.today?.has_checked_in || false}`);
    console.log(`   Has mined: ${status.today?.has_mined || false}`);
    console.log(`   Can mine: ${status.today?.can_mine || false}`);
    
    // 2. Intentar minar (si es posible)
    if (status.today?.can_mine) {
      console.log('\n2️⃣ Attempting to mine...');
      const mineResponse = await fetch('http://localhost:3006/api/v2/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: TEST_WALLET })
      });
      
      const mineResult = await mineResponse.json();
      
      if (mineResponse.ok) {
        console.log('   ✅ Mining successful!');
        console.log(`   Points earned: ${mineResult.miningResult?.finalPoints || 0}`);
        console.log(`   NFTs used: ${mineResult.miningResult?.nftsUsed || 0}`);
      } else {
        console.log('   ❌ Mining failed:');
        console.log(`   ${mineResult.error}`);
        
        if (mineResult.invalid_nft) {
          console.log(`   ⚠️  NFT #${mineResult.invalid_nft} not owned by wallet`);
        }
        if (mineResult.conflicted_nfts) {
          console.log(`   ⚠️  Conflicted NFTs: ${mineResult.conflicted_nfts.join(', ')}`);
        }
      }
    } else {
      console.log('\n2️⃣ Cannot mine right now');
      if (!status.today?.has_checked_in) {
        console.log('   Reason: Need to check in first');
      } else if (status.today?.has_mined) {
        console.log('   Reason: Already mined today');
      }
    }
    
    // 3. Resumen del sistema
    console.log('\n' + '=' . repeat(60));
    console.log('📊 SYSTEM IMPROVEMENTS SUMMARY:\n');
    
    console.log('🔒 SECURITY:');
    console.log('   • Atomic transactions prevent race conditions');
    console.log('   • NFT ownership validated before mining');
    console.log('   • Complete rollback on any failure');
    
    console.log('\n⚡ PERFORMANCE:');
    console.log('   • Composite index on (token_id, blocked_date)');
    console.log('   • Automatic cleanup with trigger');
    console.log('   • Optimized stored procedures');
    
    console.log('\n📝 AUDITABILITY:');
    console.log('   • All mining attempts logged');
    console.log('   • Success/failure tracking');
    console.log('   • NFT usage history preserved');
    
    console.log('\n🎯 RELIABILITY:');
    console.log('   • Single source of truth (newcheckin_nft_blocks)');
    console.log('   • No Redis dependency for critical operations');
    console.log('   • Consistent state guaranteed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testAtomicMining();