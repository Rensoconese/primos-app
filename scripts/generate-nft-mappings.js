const { createPublicClient, http } = require('viem');
const fs = require('fs').promises;
const path = require('path');

const NFT_CONTRACT_ADDRESS = '0x23924869ff64ab205b3e3be388a373d75de74ebd';

const nftAbi = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    type: 'function'
  }
];

const ronin = {
  id: 2020,
  name: 'Ronin',
  network: 'ronin',
  nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.roninchain.com/rpc'] }
  }
};

async function processNFTMetadata(client, tokenId) {
  try {
    // Log especial para NFTs problemáticos
    if (tokenId === 398 || tokenId === 376) {
      console.log(`\n🔍 Procesando NFT especial #${tokenId}...`);
    }
    
    // Obtener tokenURI del contrato
    const tokenURI = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: nftAbi,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });
    
    if (tokenId === 398 || tokenId === 376) {
      console.log(`  TokenURI: ${tokenURI}`);
    }

    // Obtener metadatos con timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(tokenURI, {
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    // Manejar diferentes content-types
    const contentType = response.headers.get('content-type');
    let metadata;
    
    if (contentType?.includes('application/json')) {
      metadata = await response.json();
    } else {
      const text = await response.text();
      metadata = JSON.parse(text);
    }
    
    // Extraer rareza
    const attributes = metadata.attributes || [];
    const rarityAttr = attributes.find((attr) => 
      attr.trait_type?.toLowerCase() === 'rarity'
    );
    
    let rarity = rarityAttr?.value || 'original';
    
    // Log especial para NFTs problemáticos
    if (tokenId === 398 || tokenId === 376) {
      console.log(`  ✅ Rareza detectada: "${rarity}"`);
    }
    
    // Normalizar nombres de rareza
    if (typeof rarity === 'string') {
      const rarityMap = {
        'original': 'original',
        'original z': 'original Z',
        'original z summer': 'original Z summer',
        'shiny': 'shiny',
        'shiny z': 'shiny Z',
        'shiny z summer': 'shiny Z summer',
        'unique': 'unique'
      };
      
      const lowerRarity = rarity.toLowerCase();
      rarity = rarityMap[lowerRarity] || rarity;
    }
    
    // Buscar Full Set
    const fullSetAttr = attributes.find((attr) => {
      const traitType = attr.trait_type?.toLowerCase();
      return (traitType === 'full set' || traitType === 'fullset') && attr.value === true;
    });
    const isFullSet = !!fullSetAttr;
    
    return {
      token_id: tokenId,
      rarity: rarity,
      is_full_set: isFullSet,
      metadata: metadata
    };
    
  } catch (error) {
    console.error(`❌ Error procesando NFT ${tokenId}:`, error.message);
    
    // Intentar recuperación manual para NFTs importantes
    if (tokenId === 398 || tokenId === 376) {
      console.log(`🔄 Intentando recuperación manual para NFT ${tokenId}...`);
      try {
        const backupUrl = `https://gepdgbaadctkbuxeaops.supabase.co/storage/v1/object/public/metadata/${tokenId}`;
        const backupResponse = await fetch(backupUrl);
        const backupText = await backupResponse.text();
        const backupMetadata = JSON.parse(backupText);
        
        const rarityAttr = backupMetadata.attributes?.find((attr) => 
          attr.trait_type?.toLowerCase() === 'rarity'
        );
        
        if (rarityAttr?.value) {
          console.log(`✅ Recuperación exitosa para NFT ${tokenId}: ${rarityAttr.value}`);
          return {
            token_id: tokenId,
            rarity: rarityAttr.value,
            is_full_set: false,
            metadata: backupMetadata
          };
        }
      } catch (recoveryError) {
        console.error(`❌ Falló la recuperación para NFT ${tokenId}:`, recoveryError.message);
      }
    }
    
    // Valor por defecto
    return {
      token_id: tokenId,
      rarity: 'original',
      is_full_set: false
    };
  }
}

async function generateMappings() {
  console.log('🚀 Iniciando generación de NFT mappings...\n');
  
  try {
    // Crear cliente
    const client = createPublicClient({
      chain: ronin,
      transport: http('https://api.roninchain.com/rpc')
    });
    
    // Obtener total supply
    const totalSupply = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: nftAbi,
      functionName: 'totalSupply',
    });
    
    const TOTAL_NFTS = Number(totalSupply);
    console.log(`📈 Total de NFTs en el contrato: ${TOTAL_NFTS}`);
    
    // Generar mapeo para todos los NFTs
    const nftMappings = [];
    const batchSize = 50;
    
    console.log(`⚡ Procesando ${TOTAL_NFTS} NFTs en lotes de ${batchSize}...`);
    
    for (let startId = 1; startId <= TOTAL_NFTS; startId += batchSize) {
      const endId = Math.min(startId + batchSize - 1, TOTAL_NFTS);
      console.log(`📦 Procesando lote: NFTs ${startId} - ${endId}`);
      
      const batchPromises = [];
      for (let tokenId = startId; tokenId <= endId; tokenId++) {
        batchPromises.push(processNFTMetadata(client, tokenId));
      }
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        const tokenId = startId + index;
        if (result.status === 'fulfilled' && result.value) {
          nftMappings.push(result.value);
        } else {
          nftMappings.push({
            token_id: tokenId,
            rarity: 'original',
            is_full_set: false
          });
        }
      });
      
      // Pequeña pausa entre lotes
      if (startId + batchSize <= TOTAL_NFTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Generar estadísticas
    const rarityDistribution = {};
    let fullSetCount = 0;
    
    nftMappings.forEach(nft => {
      rarityDistribution[nft.rarity] = (rarityDistribution[nft.rarity] || 0) + 1;
      if (nft.is_full_set) fullSetCount++;
    });
    
    console.log('\n📊 Distribución de rarezas:');
    Object.entries(rarityDistribution).forEach(([rarity, count]) => {
      console.log(`  ${rarity}: ${count} NFTs`);
    });
    console.log(`  Full Sets: ${fullSetCount} NFTs`);
    
    // Verificar NFTs específicos
    const nft398 = nftMappings.find(n => n.token_id === 398);
    const nft376 = nftMappings.find(n => n.token_id === 376);
    console.log('\n🔍 Verificación de NFTs problemáticos:');
    console.log(`  NFT #398: ${nft398?.rarity || 'no encontrado'}`);
    console.log(`  NFT #376: ${nft376?.rarity || 'no encontrado'}`);
    
    // Generar archivo TypeScript
    const fileContent = `// Auto-generated NFT mappings
// Generated at: ${new Date().toISOString()}
// Total NFTs: ${nftMappings.length}

export interface NFTMapping {
  token_id: number;
  rarity: string;
  is_full_set: boolean;
  metadata?: any;
}

export const NFT_MAPPINGS: NFTMapping[] = ${JSON.stringify(nftMappings, null, 2)};
`;
    
    // Guardar archivo
    const outputPath = path.join(process.cwd(), 'src', 'data', 'nftMappings.ts');
    await fs.writeFile(outputPath, fileContent, 'utf-8');
    
    console.log(`\n✅ Archivo generado exitosamente en: ${outputPath}`);
    console.log(`📦 Total de NFTs mapeados: ${nftMappings.length}`);
    
  } catch (error) {
    console.error('❌ Error generando mappings:', error);
    process.exit(1);
  }
}

// Ejecutar
generateMappings();