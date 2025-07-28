import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi } from 'viem';
import { ronin } from 'viem/chains';
import { Octokit } from '@octokit/rest';

// Lista de wallets autorizadas
const AUTHORIZED_ADMINS = [
  '0xce6818326aa1db5641528d11f3121a7f84b53eff', // PRIMOS_WALLET
  '0xc1b977a826b75a87b5423bbe952104bcee885315', // MONSAI_WALLET
  '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF', // POOL_WALLET
  '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6', // RENSO_WALLET
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6', // ADMIN_WALLET
].map(addr => addr.toLowerCase());

const NFT_CONTRACT_ADDRESS = '0x23924869ff64ab205b3e3be388a373d75de74ebd';

const nftAbi = parseAbi([
  'function totalSupply() external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
]);

// Configuración de puntos por rareza
const RARITY_POINTS = {
  'original': 2,
  'original_z': 4,
  'original_z_summer': 6,
  'shiny': 7,
  'shiny_z': 13,
  'shiny_z_summer': 15,
  'unique': 30
};

const FULL_SET_BONUS = 2;

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

    console.log('🚀 Iniciando sincronización completa de colección NFT...');

    // 1. Crear cliente para consultar el contrato
    const client = createPublicClient({
      chain: ronin,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    });

    // 2. Obtener el total supply del contrato
    console.log('📊 Consultando totalSupply del contrato...');
    const totalSupply = await client.readContract({
      address: NFT_CONTRACT_ADDRESS as `0x${string}`,
      abi: nftAbi,
      functionName: 'totalSupply',
    });

    const TOTAL_NFTS = Number(totalSupply);
    console.log(`📈 TOTAL REAL DE NFTs EN CONTRATO: ${TOTAL_NFTS}`);

    // 3. Generar puntos para TODOS los NFTs
    const nftPoints: Record<string, number> = {};
    let processedCount = 0;
    const batchSize = 50; // Procesar en lotes para evitar rate limiting

    console.log(`⚡ Procesando ${TOTAL_NFTS} NFTs en lotes de ${batchSize}...`);

    for (let startId = 1; startId <= TOTAL_NFTS; startId += batchSize) {
      const endId = Math.min(startId + batchSize - 1, TOTAL_NFTS);
      console.log(`📦 Procesando lote: NFTs ${startId} - ${endId}`);

      // Procesar lote en paralelo
      const batchPromises = [];
      for (let tokenId = startId; tokenId <= endId; tokenId++) {
        batchPromises.push(processNFTMetadata(client, tokenId));
      }

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        const tokenId = startId + index;
        if (result.status === 'fulfilled' && result.value) {
          nftPoints[tokenId.toString()] = result.value;
          processedCount++;
        } else {
          // Si falla, asignar puntos por defecto (original)
          nftPoints[tokenId.toString()] = RARITY_POINTS.original;
          processedCount++;
          console.warn(`⚠️ NFT ${tokenId}: usando puntos por defecto`);
        }
      });

      // Pequeña pausa entre lotes
      if (endId < TOTAL_NFTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Procesamiento completado: ${processedCount}/${TOTAL_NFTS} NFTs`);

    // 4. Generar estadísticas
    const stats = generateStats(nftPoints);

    // 5. Generar el contenido del archivo
    const fileContent = `// Mapa de puntos de NFTs - Colección Completa
// Generado automáticamente el ${new Date().toISOString()}
// NO MODIFICAR MANUALMENTE
// Fuente: Contrato ${NFT_CONTRACT_ADDRESS}
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

    // 6. Escribir a GitHub
    let fileWritten = false;
    let commitSha = '';
    
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        console.log('📤 Subiendo archivo completo a GitHub...');
        
        const octokit = new Octokit({
          auth: githubToken,
        });
        
        const owner = 'Rensoconese';
        const repo = 'primos-app';
        const path = 'src/data/nftPoints.ts';
        const branch = 'main';
        
        // Obtener SHA del archivo actual
        let currentFileSha = '';
        try {
          const { data: currentFile } = await octokit.rest.repos.getContent({
            owner, repo, path, ref: branch,
          });
          if ('sha' in currentFile) {
            currentFileSha = currentFile.sha;
          }
        } catch (getError) {
          console.log('Archivo no existe, creando nuevo archivo');
        }
        
        const commitMessage = `feat: Sincronizar colección completa de NFTs - ${new Date().toISOString()}

Total NFTs: ${TOTAL_NFTS} (desde contrato)
Procesados: ${processedCount}
Contrato: ${NFT_CONTRACT_ADDRESS}
Admin: ${adminWallet}

Estadísticas:
${JSON.stringify(stats, null, 2)}

🤖 Generated with [Claude Code](https://claude.ai/code)`;

        const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
          owner, repo, path,
          message: commitMessage,
          content: Buffer.from(fileContent).toString('base64'),
          sha: currentFileSha || undefined,
          branch,
        });
        
        commitSha = commitData.commit.sha;
        fileWritten = true;
        console.log(`✅ Archivo sincronizado en GitHub: ${commitSha}`);
        
      } else {
        console.log('⚠️ GITHUB_TOKEN no configurado');
      }
    } catch (githubError) {
      console.error('❌ Error subiendo a GitHub:', githubError);
    }

    return NextResponse.json({
      success: true,
      message: `Colección completa sincronizada: ${TOTAL_NFTS} NFTs`,
      totalNFTs: TOTAL_NFTS,
      processedNFTs: processedCount,
      contractAddress: NFT_CONTRACT_ADDRESS,
      stats,
      githubCommit: fileWritten ? commitSha : null
    });

  } catch (error) {
    console.error('Error en sync-full-collection:', error);
    return NextResponse.json(
      { error: 'Error al sincronizar colección' },
      { status: 500 }
    );
  }
}

// Función para procesar metadatos de un NFT individual
async function processNFTMetadata(client: any, tokenId: number): Promise<number> {
  try {
    // Obtener tokenURI del contrato
    const tokenURI = await client.readContract({
      address: NFT_CONTRACT_ADDRESS as `0x${string}`,
      abi: nftAbi,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });

    // Obtener metadatos del URI
    const response = await fetch(tokenURI);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const metadata = await response.json();
    
    // Extraer rareza y traits
    const attributes = metadata.attributes || [];
    
    // Buscar rareza
    const rarityAttr = attributes.find((attr: any) => 
      attr.trait_type?.toLowerCase() === 'rarity'
    );
    const rarity = rarityAttr?.value?.toLowerCase() || 'original';
    
    // Buscar Full Set
    const fullSetAttr = attributes.find((attr: any) => {
      const traitType = attr.trait_type?.toLowerCase();
      return (traitType === 'full set' || traitType === 'fullset') && attr.value === true;
    });
    const isFullSet = !!fullSetAttr;
    
    // Mapear rareza a puntos
    let points = RARITY_POINTS.original; // default
    
    if (rarity.includes('unique')) {
      points = RARITY_POINTS.unique;
    } else if (rarity.includes('shiny') && rarity.includes('z') && rarity.includes('summer')) {
      points = RARITY_POINTS.shiny_z_summer;
    } else if (rarity.includes('shiny') && rarity.includes('z')) {
      points = RARITY_POINTS.shiny_z;
    } else if (rarity.includes('shiny')) {
      points = RARITY_POINTS.shiny;
    } else if (rarity.includes('original') && rarity.includes('z') && rarity.includes('summer')) {
      points = RARITY_POINTS.original_z_summer;
    } else if (rarity.includes('original') && rarity.includes('z')) {
      points = RARITY_POINTS.original_z;
    } else if (rarity.includes('original')) {
      points = RARITY_POINTS.original;
    }
    
    // Agregar bonus Full Set
    if (isFullSet) {
      points += FULL_SET_BONUS;
    }
    
    return points;
    
  } catch (error) {
    console.error(`Error procesando NFT ${tokenId}:`, error);
    return RARITY_POINTS.original; // Valor por defecto en caso de error
  }
}

// Función para generar estadísticas
function generateStats(nftPoints: Record<string, number>) {
  const pointsDistribution: Record<string, number> = {};
  
  Object.values(nftPoints).forEach(points => {
    const key = points.toString();
    pointsDistribution[key] = (pointsDistribution[key] || 0) + 1;
  });
  
  return {
    totalNFTs: Object.keys(nftPoints).length,
    pointsDistribution,
    maxPoints: Math.max(...Object.values(nftPoints)),
    minPoints: Math.min(...Object.values(nftPoints)),
  };
}