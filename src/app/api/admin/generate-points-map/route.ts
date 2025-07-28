import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Octokit } from '@octokit/rest';

// Lista de wallets autorizadas
const AUTHORIZED_ADMINS = [
  '0xce6818326aa1db5641528d11f3121a7f84b53eff', // PRIMOS_WALLET
  '0xc1b977a826b75a87b5423bbe952104bcee885315', // MONSAI_WALLET
  '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF', // POOL_WALLET
  '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6', // RENSO_WALLET
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6', // ADMIN_WALLET
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

    // 2. Generar TODOS los token IDs de la colección (1 a 2378)
    console.log('Generando puntos para TODOS los NFTs de la colección (1-2378)...');
    
    // Obtener metadatos conocidos de la base de datos como referencia
    const { data: nfts, error: nftsError } = await supabase
      .from('nfts')
      .select('token_id, rarity, metadata, is_full_set')
      .order('token_id', { ascending: true });

    if (nftsError) {
      console.warn('Advertencia al obtener NFTs de la BD:', nftsError);
    }

    console.log(`Encontrados ${nfts?.length || 0} NFTs con metadatos en la base de datos`);
    
    // Debug: verificar si NFT #2228 está en la consulta
    const nft2228InQuery = nfts?.find(nft => Number(nft.token_id) === 2228);
    console.log(`NFT #2228 en consulta:`, nft2228InQuery ? 'SÍ' : 'NO');
    if (nft2228InQuery) {
      console.log(`NFT #2228 datos:`, {
        token_id: nft2228InQuery.token_id,
        rarity: nft2228InQuery.rarity,
        is_full_set: nft2228InQuery.is_full_set
      });
    }

    // 3. Obtener el rango real de NFTs de la base de datos
    const { data: tokenRange, error: rangeError } = await supabase
      .from('nfts')
      .select('token_id')
      .order('token_id', { ascending: false })
      .limit(1)
      .single();

    if (rangeError) {
      console.error('Error al obtener rango de NFTs:', rangeError);
      return NextResponse.json(
        { error: 'Error al obtener información de NFTs' },
        { status: 500 }
      );
    }

    const MAX_TOKEN_ID = Number(tokenRange.token_id);
    console.log(`📊 COLECCIÓN REAL: NFTs van desde 1 hasta ${MAX_TOKEN_ID}`);

    // Crear mapas para TODOS los token IDs (1 hasta el máximo encontrado)
    const tokenToRarityMap = new Map<number, string>();
    const tokenToFullSetMap = new Map<number, boolean>();

    // Primero, generar todos los token IDs y asignar rareza por defecto
    for (let tokenId = 1; tokenId <= MAX_TOKEN_ID; tokenId++) {
      tokenToRarityMap.set(tokenId, 'original'); // Default rarity
    }

    // Luego, sobrescribir con datos conocidos de la base de datos
    nfts?.forEach(nft => {
      const tokenId = Number(nft.token_id);
      
      // Guardar si es Full Set
      if (nft.is_full_set) {
        tokenToFullSetMap.set(tokenId, true);
        // Debug específico para NFT #2228
        if (tokenId === 2228) {
          console.log('🎯 NFT #2228: Full Set detectado en campo is_full_set');
        }
      }
      
      // Determinar rareza del NFT
      let rarity = nft.rarity?.toLowerCase()?.trim()?.replace(/\0/g, '') || '';
      
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

      // Guardar la rareza mapeada (siempre sobrescribir con la rareza detectada)
      tokenToRarityMap.set(tokenId, mappedRarity);
    });

    // Debug: mostrar estadísticas del mapeo de rareza
    console.log(`✅ Mapeo de rareza completado:`);
    console.log(`Total NFTs procesados: ${TOTAL_NFTS}`);
    console.log(`Total NFTs con rareza mapeada: ${tokenToRarityMap.size}`);
    
    // Contar por tipo de rareza
    const rarityStats: Record<string, number> = {};
    for (const rarity of tokenToRarityMap.values()) {
      rarityStats[rarity] = (rarityStats[rarity] || 0) + 1;
    }
    console.log('Estadísticas de rareza:', rarityStats);

    // Debug: verificar algunos NFTs específicos
    const sampleTokens = [1, 20, 35, 100, 500, 1000, 2228];
    console.log('🔍 Muestra de NFTs mapeados:');
    sampleTokens.forEach(tokenId => {
      const rarity = tokenToRarityMap.get(tokenId);
      console.log(`NFT #${tokenId}: ${rarity || 'NO MAPEADO'}`);
    });

    // 4. Generar el objeto de puntos
    const nftPoints: Record<string, number> = {};
    let totalProcessed = 0;
    let totalFullSets = 0;
    
    // Debug específico para NFT #2228
    const nft2228Debug = {
      foundInTokenToFullSetMap: tokenToFullSetMap.has(2228),
      tokenToFullSetMapSize: tokenToFullSetMap.size,
      rarity: tokenToRarityMap.get(2228) || 'not_found',
      fullSetBonus: 0,
      basePoints: 0,
      finalPoints: 0
    };

    // Procesar TODOS los NFTs de la colección (1-2378)
    let unmappedCount = 0;
    const finalRarityStats: Record<string, number> = {};
    
    for (let tokenId = 1; tokenId <= TOTAL_NFTS; tokenId++) {
      const rarity = tokenToRarityMap.get(tokenId) || 'original';
      let points = rarityPointsMap[rarity] || 1;
      
      // Contar NFTs no mapeados
      if (!tokenToRarityMap.has(tokenId)) {
        unmappedCount++;
      }
      
      // Estadísticas finales
      finalRarityStats[rarity] = (finalRarityStats[rarity] || 0) + 1;
      
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
          
          nft2228Debug.fullSetBonus = fullSetBonus;
          nft2228Debug.basePoints = rarityPointsMap[rarity] || 1;
          nft2228Debug.finalPoints = points;
        }
      } else if (tokenId === 2228) {
        console.log('❌ NFT #2228: Full Set NO detectado en el mapa');
        console.log(`TokenToFullSetMap contiene: ${Array.from(tokenToFullSetMap.keys()).includes(2228)}`);
        
        nft2228Debug.basePoints = rarityPointsMap[rarity] || 1;
        nft2228Debug.finalPoints = points;
      }
      
      nftPoints[tokenId.toString()] = points;
      totalProcessed++;
    }

    console.log(`📊 Estadísticas finales de procesamiento:`);
    console.log(`Procesados ${totalProcessed} NFTs, ${totalFullSets} con Full Set`);
    console.log(`NFTs no mapeados (usando default 'original'): ${unmappedCount}`);
    console.log('Distribución final de rarezas:', finalRarityStats);
    console.log(`🎯 IMPORTANTE: Generando archivo con ${TOTAL_NFTS} NFTs (colección completa)`);

    // 5. Generar el contenido del archivo
    const fileContent = `// Mapa de puntos de NFTs
// Generado automáticamente el ${new Date().toISOString()}
// NO MODIFICAR MANUALMENTE

// Total de NFTs: ${TOTAL_NFTS}

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

    // 6. Escribir a GitHub usando la API
    let fileWritten = false;
    let commitSha = '';
    
    try {
      // Solo hacer commit si tenemos GitHub token
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        console.log('Iniciando commit automático a GitHub...');
        
        const octokit = new Octokit({
          auth: githubToken,
        });
        
        // Configuración del repositorio
        const owner = 'Rensoconese'; // Tu usuario de GitHub
        const repo = 'primos-app';   // Tu repositorio
        const path = 'src/data/nftPoints.ts';
        const branch = 'main';
        
        // Obtener el archivo actual para el SHA
        let currentFileSha = '';
        try {
          const { data: currentFile } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref: branch,
          });
          if ('sha' in currentFile) {
            currentFileSha = currentFile.sha;
          }
        } catch (getError) {
          console.log('Archivo no existe, creando nuevo archivo');
        }
        
        // Crear/actualizar archivo
        const commitMessage = `chore: Regenerar mapa de puntos NFT - ${new Date().toISOString()}

Total NFTs: ${totalProcessed}
Total Full Sets: ${totalFullSets}
Admin: ${adminWallet}

🤖 Generated with [Claude Code](https://claude.ai/code)`;

        const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path,
          message: commitMessage,
          content: Buffer.from(fileContent).toString('base64'),
          sha: currentFileSha || undefined,
          branch,
        });
        
        commitSha = commitData.commit.sha;
        fileWritten = true;
        console.log(`✅ Commit exitoso a GitHub: ${commitSha}`);
        
      } else {
        console.log('⚠️ GITHUB_TOKEN no configurado, no se puede hacer commit automático');
      }
    } catch (githubError) {
      console.error('❌ Error haciendo commit a GitHub:', githubError);
      // No fallar la operación por error de GitHub
    }

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
      message: fileWritten 
        ? `Mapa de puntos generado y commitado a GitHub (${commitSha.substring(0, 7)})` 
        : 'Mapa de puntos calculado (sin commit - GITHUB_TOKEN no configurado)',
      totalNFTs: TOTAL_NFTS,
      totalFullSets: totalFullSets,
      rarityConfig: rarityPointsMap,
      fileContent: fileContent, // Siempre devolver el contenido para debug
      nft2228Points: nftPoints['2228'], // Debug específico para NFT #2228
      nft2228Debug: nft2228Debug, // Debug completo de NFT #2228
      githubCommit: fileWritten ? commitSha : null
    });

  } catch (error) {
    console.error('Error en generate-points-map:', error);
    return NextResponse.json(
      { error: 'Error al generar archivo de puntos' },
      { status: 500 }
    );
  }
}