import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';

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
    
    // Debug: mostrar mapeo exacto
    console.log('\n🔍 Mapeo de configuración de BD:');
    Object.entries(rarityPointsMap).forEach(([key, value]) => {
      console.log(`  "${key}" → ${value} puntos`);
    });

    // 2. Leer el archivo de mapeo generado por sync-full-collection
    console.log('Leyendo archivo de mapeo de NFTs...');
    
    let nftMappings;
    try {
      // Intentar leer el archivo de mapeo local primero
      const mappingPath = path.join(process.cwd(), 'src', 'data', 'nftMappings.ts');
      const fileContent = await fs.readFile(mappingPath, 'utf-8');
      
      // Extraer el array NFT_MAPPINGS del archivo TypeScript
      // El regex debe capturar arrays muy grandes con saltos de línea
      const mappingsMatch = fileContent.match(/export const NFT_MAPPINGS: NFTMapping\[\] = (\[[\s\S]*?\]);/);
      if (!mappingsMatch) {
        throw new Error('No se encontró NFT_MAPPINGS en el archivo');
      }
      
      // Parsear el JSON
      nftMappings = JSON.parse(mappingsMatch[1]);
      console.log(`✅ Archivo de mapeo leído: ${nftMappings.length} NFTs`);
      
    } catch (fileError) {
      console.error('Error leyendo archivo local:', fileError);
      console.log('Intentando obtener desde GitHub...');
      
      // Si falla localmente, intentar desde GitHub
      try {
        const githubToken = process.env.GITHUB_TOKEN;
        if (!githubToken) {
          throw new Error('GITHUB_TOKEN no configurado');
        }
        
        const octokit = new Octokit({ auth: githubToken });
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner: 'Rensoconese',
          repo: 'primos-app',
          path: 'src/data/nftMappings.ts',
          ref: 'main'
        });
        
        if ('content' in fileData) {
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          // El regex debe capturar arrays muy grandes con saltos de línea
          const mappingsMatch = content.match(/export const NFT_MAPPINGS: NFTMapping\[\] = (\[[\s\S]*?\]);/);
          if (!mappingsMatch) {
            throw new Error('No se encontró NFT_MAPPINGS en el archivo de GitHub');
          }
          nftMappings = JSON.parse(mappingsMatch[1]);
          console.log(`✅ Archivo de mapeo obtenido desde GitHub: ${nftMappings.length} NFTs`);
        }
      } catch (githubError) {
        console.error('Error obteniendo desde GitHub:', githubError);
        return NextResponse.json(
          { error: 'No se pudo leer el archivo de mapeo. Ejecute sync-full-collection primero.' },
          { status: 500 }
        );
      }
    }

    if (!nftMappings || !Array.isArray(nftMappings) || nftMappings.length === 0) {
      return NextResponse.json(
        { error: 'Archivo de mapeo vacío o inválido. Ejecute sync-full-collection primero.' },
        { status: 400 }
      );
    }

    const MAX_TOKEN_ID = Math.max(...nftMappings.map(nft => nft.token_id));
    console.log(`📊 COLECCIÓN: ${nftMappings.length} NFTs mapeados (máximo ID: ${MAX_TOKEN_ID})`)

    // 3. Generar el objeto de puntos basado en el mapeo
    const nftPoints: Record<string, number> = {};
    let totalProcessed = 0;
    let totalFullSets = 0;
    const finalRarityStats: Record<string, number> = {};
    
    // Procesar cada NFT del mapeo
    nftMappings.forEach((nft: any) => {
      const tokenId = nft.token_id;
      const rarity = nft.rarity;
      const isFullSet = nft.is_full_set;
      
      // Mapear nombres de rareza del archivo a los nombres de la BD
      // El archivo tiene "original Z summer" pero la BD tiene "original_z_summer"
      const rarityMappings: Record<string, string> = {
        'original': 'original',
        'original Z': 'original_z',
        'original Z summer': 'original_z_summer',
        'shiny': 'shiny',
        'shiny Z': 'shiny_z',
        'shiny Z summer': 'shiny_z_summer',
        'unique': 'unique'
      };
      
      // Obtener el nombre de rareza para la BD
      const dbRarity = rarityMappings[rarity] || rarity.toLowerCase().replace(/ /g, '_');
      
      // Obtener puntos base según la rareza
      let points = rarityPointsMap[dbRarity];
      
      if (points === undefined) {
        console.warn(`⚠️ Rareza no configurada: "${rarity}" (mapeada como "${dbRarity}") para NFT ${tokenId}`);
        points = rarityPointsMap['original'] || 1; // Default a original
      }
      
      // Debug específico para NFT 360
      if (tokenId === 360) {
        console.log(`\n🎯 Debug NFT #360:`);
        console.log(`  Rareza original: "${rarity}"`);
        console.log(`  Rareza mapeada: "${dbRarity}"`);
        console.log(`  Puntos base: ${points}`);
        console.log(`  Full Set: ${isFullSet}`);
      }
      
      // Estadísticas de rareza
      finalRarityStats[rarity] = (finalRarityStats[rarity] || 0) + 1;
      
      // Agregar bonus de Full Set si aplica
      if (isFullSet) {
        points += fullSetBonus;
        totalFullSets++;
        console.log(`🎖️ NFT ${tokenId}: Full Set bonus aplicado (+${fullSetBonus})`);
      }
      
      // Asignar puntos finales
      nftPoints[tokenId.toString()] = points;
      totalProcessed++;
    });

    console.log(`📊 Estadísticas finales de procesamiento:`);
    console.log(`Procesados ${totalProcessed} NFTs, ${totalFullSets} con Full Set`);
    console.log('Distribución de rarezas:', finalRarityStats);
    console.log(`🎯 Generando archivo con ${totalProcessed} NFTs`);
    
    // Verificar NFT 360 en el resultado final
    console.log(`\n✅ NFT #360 en archivo final: ${nftPoints['360']} puntos`);

    // 4. Generar el contenido del archivo
    const fileContent = `// Mapa de puntos de NFTs
// Generado automáticamente el ${new Date().toISOString()}
// NO MODIFICAR MANUALMENTE
// Basado en: src/data/nftMappings.ts
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

    // 5. Escribir archivo localmente primero
    try {
      const localPath = path.join(process.cwd(), 'src', 'data', 'nftPoints.ts');
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log('✅ Archivo escrito localmente');
    } catch (localError) {
      console.error('Error escribiendo archivo local:', localError);
    }
    
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
Basado en: src/data/nftMappings.ts

Configuración de puntos aplicada:
${JSON.stringify(rarityPointsMap, null, 2)}
Full Set Bonus: +${fullSetBonus}

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
      totalNFTs: totalProcessed,
      totalFullSets: totalFullSets,
      rarityConfig: rarityPointsMap,
      rarityStats: finalRarityStats,
      basedOnFile: 'src/data/nftMappings.ts',
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