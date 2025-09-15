const fs = require('fs').promises;
const path = require('path');

async function fixNFT398() {
  console.log('🔧 Fixing NFT 398 and 376 in nftMappings.ts...\n');
  
  try {
    // Read current file
    const filePath = path.join(process.cwd(), 'src', 'data', 'nftMappings.ts');
    let fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Count current occurrences
    const before398 = fileContent.match(/"token_id": 398,\s*"rarity": "([^"]+)"/)?.[1];
    const before376 = fileContent.match(/"token_id": 376,\s*"rarity": "([^"]+)"/)?.[1];
    
    console.log('Current status:');
    console.log(`  NFT #398: "${before398}"`);
    console.log(`  NFT #376: "${before376}"`);
    
    // Fix NFT 398
    fileContent = fileContent.replace(
      /"token_id": 398,\s*"rarity": "original"/,
      '"token_id": 398,\n    "rarity": "original Z summer"'
    );
    
    // Fix NFT 376 (if needed)
    if (before376 !== 'original Z summer') {
      fileContent = fileContent.replace(
        /"token_id": 376,\s*"rarity": "[^"]+"/,
        '"token_id": 376,\n    "rarity": "original Z summer"'
      );
    }
    
    // Save file
    await fs.writeFile(filePath, fileContent, 'utf-8');
    
    // Verify changes
    const updatedContent = await fs.readFile(filePath, 'utf-8');
    const after398 = updatedContent.match(/"token_id": 398,\s*"rarity": "([^"]+)"/)?.[1];
    const after376 = updatedContent.match(/"token_id": 376,\s*"rarity": "([^"]+)"/)?.[1];
    
    console.log('\n✅ After fix:');
    console.log(`  NFT #398: "${after398}"`);
    console.log(`  NFT #376: "${after376}"`);
    
    if (after398 === 'original Z summer' && after376 === 'original Z summer') {
      console.log('\n🎉 Successfully fixed both NFTs!');
      console.log('Now run "Regenerar Mapa de Puntos" from the admin panel.');
    } else {
      console.log('\n⚠️ Some NFTs were not fixed properly.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixNFT398();