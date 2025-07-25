import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Lista de wallets autorizadas
const AUTHORIZED_ADMINS = [
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6',
  '0xfC5B6724c8AD723964A94E68fCD0Df3485ED9d61',
  '0x5B8C49b96C30FbC4CB96Ddf7D09BA99d96CB4a44',
  '0xD4B1E88a666452e8473151E51D3eaBA8Fda44A31',
  '0x7a1d960b88C088c8f577c5dcee88E670E57A9530',
  '0x90D69dF93B2fCaac890Bf0CdCd52Ca16fE951B48',
  '0x1f9fB4B8eb7a7d996B6f4A2a859f2f8cBe6c9dD1',
  '0xb1ae7BC6949E32A0F652F8872B3Aa37aF7ca7E2f',
  '0xA1DF982FcA99bEda0Aa067D3A44fcb3e016A2080',
  '0xAB5a3D4E5Fc5A085FA5DDa9bbf86ef13a57Aa2d7',
  '0x97a42b1Ef7C1dE9bDe7B8F951EDa37a08B0dB8ce',
  '0x7f7d1CB59dDaB3b9B52E5b3D1CE826dA3c0B2C07',
  '0xEc92Ed45072a4Ad5B5b3F039a4Be949d0937c381',
  '0xEa0a0D3Bec99784dF3b95411dE963F5C755FFf33',
  '0x61da36b4Eac7ce7CB2B5A91fa4D5B4A685E07bBD',
  '0x6C93a18C96DdcE993E088C4f59B6D6AAa45d5faf',
  '0xd80b39eB0db7F8b039C5BD686eC6D0c87C6aF1dd',
  '0xCe4e00c69c88Fb2A42D52e7F327eF97e0A0A77C5',
  '0xef1Ac8b214AC5C0B5a91002F82F690a6CaAcb4Eb',
  '0x9D1F2dd085b5dD411F12De1b06e5cb83eDFA65ec',
  '0xeCE5CBA12F3f518085A2E5575f3A95196ec7eCb5',
  '0x23ABBe8e821F45E1d6E5f5dF016Ce33DAb3E7F33',
  '0xd8B934580fcE35a11B58C6D73aDeE468a2833fa8',
  '0xac5e1Ea73d81F0e2d5e688c88bc96b90fC8FA25e',
  '0xA59E77dD060D08Cd5862440d079fAaEB2e9b7b78',
  '0x3A34d58848Cc1Cf2151FC757c5dEc96c0d4BCaB4',
  '0x24B0322b0D2E0e37A8CaB5Ba016E8c0d96Df6a05',
  '0x0c66CE5d0539eF0E2f88c4dDb4F9B65b9E3c273C',
  '0xE96A4E0fD67CB52ab6B079a15f5a8eDaE16Ee06b',
  '0x60C80F3B837c2D06e8B9a7Af4a7E3c21dd99d2cb',
  '0x48b86DB72e3fBb60E8d5F1AECb18381Da8E1aCD9',
  '0x37e3f3c4A0Ee3E08BC92c80e4d12aCd27Ca8923A',
  '0x8b0Ef7F2ab96a51ff00c1ca92d859a4065ea3E95',
  '0x31fCbAE2F646ee067f1D4f88Cb891bDB03eBCf4e'
].map(addr => addr.toLowerCase());

// POST - Generar archivo de puntos
export async function POST(request: Request) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const adminWallet = authHeader.replace('Bearer ', '').toLowerCase();
    
    if (!AUTHORIZED_ADMINS.includes(adminWallet)) {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    console.log('Iniciando generación de archivo de puntos...');

    // 1. Obtener configuración de rareza
    const { data: rarityConfigs, error: rarityError } = await supabase
      .from('nft_points_mapping')
      .select('rarity_type, base_points')
      .lte('token_id', 0)
      .eq('active', true);

    if (rarityError) {
      console.error('Error al obtener configuración de rareza:', rarityError);
      return NextResponse.json(
        { error: 'Error al obtener configuración de rareza' },
        { status: 500 }
      );
    }

    // Crear mapa de rareza a puntos
    const rarityPointsMap: Record<string, number> = {};
    let fullSetBonus = 2; // valor por defecto
    
    rarityConfigs?.forEach(config => {
      if (config.rarity_type === 'full_set') {
        fullSetBonus = config.base_points;
      } else {
        rarityPointsMap[config.rarity_type] = config.base_points;
      }
    });

    console.log('Configuración de rareza:', rarityPointsMap);
    console.log('Bonus Full Set:', fullSetBonus);

    // 2. Obtener todos los NFTs únicos de la base de datos
    const { data: nfts, error: nftsError } = await supabase
      .from('nfts')
      .select('token_id, rarity, metadata, is_full_set')
      .order('token_id', { ascending: true });

    if (nftsError) {
      console.error('Error al obtener NFTs:', nftsError);
      return NextResponse.json(
        { error: 'Error al obtener NFTs' },
        { status: 500 }
      );
    }

    console.log(`Encontrados ${nfts?.length || 0} NFTs en la base de datos`);

    // 3. Crear un Set para obtener token_ids únicos
    const uniqueTokenIds = new Set<number>();
    const tokenToRarityMap = new Map<number, string>();
    const tokenToFullSetMap = new Map<number, boolean>();

    nfts?.forEach(nft => {
      const tokenId = Number(nft.token_id);
      uniqueTokenIds.add(tokenId);
      
      // Guardar si es Full Set
      if (nft.is_full_set) {
        tokenToFullSetMap.set(tokenId, true);
        // Debug específico para NFT #2228
        if (tokenId === 2228) {
          console.log('🎯 NFT #2228: Full Set detectado en campo is_full_set');
        }
      }
      
      // Determinar rareza del NFT
      let rarity = nft.rarity?.toLowerCase() || '';
      
      // Si no hay rareza en el campo directo, intentar obtenerla de metadata
      if (!rarity && nft.metadata && typeof nft.metadata === 'object') {
        const metadata = nft.metadata as any;
        const attributes = metadata.attributes || [];
        const rarityAttr = attributes.find((attr: any) => 
          attr.trait_type?.toLowerCase() === 'rarity'
        );
        if (rarityAttr) {
          rarity = rarityAttr.value?.toLowerCase() || '';
        }
        
        // También verificar Full Set en metadata si no está en el campo directo
        if (!tokenToFullSetMap.has(tokenId)) {
          try {
            const fullSetAttr = attributes.find((attr: any) => {
              const traitType = attr.trait_type?.toLowerCase();
              return (traitType === 'full set' || traitType === 'fullset') && attr.value === true;
            });
            if (fullSetAttr) {
              tokenToFullSetMap.set(tokenId, true);
              // Debug específico para NFT #2228
              if (tokenId === 2228) {
                console.log('🎯 NFT #2228: Full Set detectado en metadata');
                console.log(`Atributo: ${JSON.stringify(fullSetAttr)}`);
              }
            }
          } catch (metaError) {
            console.error(`Error procesando metadata para NFT ${tokenId}:`, metaError);
          }
        }
      }

      // Mapear la rareza a nuestros tipos configurados
      let mappedRarity = 'original'; // default
      
      if (rarity.includes('unique')) {
        mappedRarity = 'unique';
      } else if (rarity.includes('shiny') && rarity.includes('z') && rarity.includes('summer')) {
        mappedRarity = 'shiny_z_summer';
      } else if (rarity.includes('shiny') && rarity.includes('z')) {
        mappedRarity = 'shiny_z';
      } else if (rarity.includes('shiny')) {
        mappedRarity = 'shiny';
      } else if (rarity.includes('original') && rarity.includes('z') && rarity.includes('summer')) {
        mappedRarity = 'original_z_summer';
      } else if (rarity.includes('original') && rarity.includes('z')) {
        mappedRarity = 'original_z';
      } else if (rarity.includes('original')) {
        mappedRarity = 'original';
      }

      // Solo guardar si no existe o si encontramos una rareza más específica
      if (!tokenToRarityMap.has(tokenId) || mappedRarity !== 'original') {
        tokenToRarityMap.set(tokenId, mappedRarity);
      }
    });

    // 4. Generar el objeto de puntos
    const nftPoints: Record<string, number> = {};
    let totalProcessed = 0;
    let totalFullSets = 0;

    // Procesar del 1 al 3000 (asumiendo que hay 3000 NFTs)
    for (let tokenId = 1; tokenId <= 3000; tokenId++) {
      const rarity = tokenToRarityMap.get(tokenId) || 'original';
      let points = rarityPointsMap[rarity] || 1;
      
      // Agregar bonus de Full Set si aplica
      if (tokenToFullSetMap.has(tokenId)) {
        points += fullSetBonus;
        totalFullSets++;
        
        // Debug específico para NFT #2228
        if (tokenId === 2228) {
          console.log('🎯 NFT #2228: FULL SET BONUS APLICADO');
          console.log(`Base points: ${rarityPointsMap[rarity] || 1}`);
          console.log(`Full Set bonus: ${fullSetBonus}`);
          console.log(`Total points: ${points}`);
        }
      } else if (tokenId === 2228) {
        console.log('❌ NFT #2228: Full Set NO detectado en el mapa');
        console.log(`TokenToFullSetMap contiene: ${Array.from(tokenToFullSetMap.keys()).includes(2228)}`);
      }
      
      nftPoints[tokenId.toString()] = points;
      totalProcessed++;
    }

    console.log(`Procesados ${totalProcessed} NFTs, ${totalFullSets} con Full Set`);

    // 5. Generar el contenido del archivo
    const fileContent = `// Mapa de puntos de NFTs
// Generado automáticamente el ${new Date().toISOString()}
// NO MODIFICAR MANUALMENTE

// Total de NFTs: ${totalProcessed}

export const NFT_POINTS: Record<string, number> = ${JSON.stringify(nftPoints, null, 2)};

/**
 * Obtiene los puntos de bonificación para un NFT por su ID
 * @param tokenId ID del NFT a consultar
 * @returns Puntos de bonificación del NFT
 * @throws Error si el tokenId no existe en el mapa
 */
export function getNFTPoints(tokenId: string): number {
  const points = NFT_POINTS[tokenId];
  
  if (points === undefined) {
    throw new Error(\`NFT con ID \${tokenId} no encontrado en el mapa de puntos\`);
  }
  
  return points;
}

/**
 * Verifica si un NFT existe en el mapa de puntos
 * @param tokenId ID del NFT a verificar
 * @returns true si el NFT existe en el mapa, false si no
 */
export function hasNFTPoints(tokenId: string): boolean {
  return NFT_POINTS[tokenId] !== undefined;
}

/**
 * Obtiene los puntos de bonificación para un NFT por su ID de forma segura
 * @param tokenId ID del NFT a consultar
 * @param defaultValue Valor por defecto si el NFT no existe en el mapa
 * @returns Puntos de bonificación del NFT o defaultValue si no existe
 */
export function getNFTPointsSafe(tokenId: string, defaultValue: number = 0): number {
  return NFT_POINTS[tokenId] !== undefined ? NFT_POINTS[tokenId] : defaultValue;
}
`;

    // 6. En producción (Vercel) no podemos escribir archivos
    const fileWritten = false;
    console.log('Mapa de puntos generado correctamente (archivo no escrito en producción)');

    // 7. Registrar en auditoría
    await supabase
      .from('admin_actions_log')
      .insert({
        admin_wallet: adminWallet,
        action_type: 'update_nft_mapping',
        target_id: 'generate_points_map',
        new_value: `${totalProcessed} NFTs`,
        reason: 'Regeneración del mapa de puntos NFT',
        metadata: {
          total_nfts: totalProcessed,
          total_full_sets: totalFullSets,
          rarity_config: rarityPointsMap,
          full_set_bonus: fullSetBonus
        }
      });

    return NextResponse.json({
      success: true,
      message: fileWritten ? 'Archivo de puntos generado exitosamente' : 'Mapa de puntos calculado (archivo no escrito en producción)',
      totalNFTs: totalProcessed,
      totalFullSets: totalFullSets,
      rarityConfig: rarityPointsMap,
      fileContent: fileContent, // Siempre devolver el contenido para debug
      nft2228Points: nftPoints['2228'] // Debug específico para NFT #2228
    });

  } catch (error) {
    console.error('Error en generate-points-map:', error);
    return NextResponse.json(
      { error: 'Error al generar archivo de puntos' },
      { status: 500 }
    );
  }
}