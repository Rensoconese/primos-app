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

// Interface para el mapeo de NFTs
interface NFTMapping {
  token_id: number;
  rarity: string;
  is_full_set: boolean;
  metadata?: any;
}

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

    // 3. Generar mapeo para TODOS los NFTs
    const nftMappings: NFTMapping[] = [];
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
          nftMappings.push(result.value);
          processedCount++;
        } else {
          // Si falla, asignar mapeo por defecto
          nftMappings.push({
            token_id: tokenId,
            rarity: 'original',
            is_full_set: false
          });
          processedCount++;
          console.warn(`⚠️ NFT ${tokenId}: usando mapeo por defecto`);
        }
      });

      // Pequeña pausa entre lotes
      if (endId < TOTAL_NFTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Procesamiento completado: ${processedCount}/${TOTAL_NFTS} NFTs`);

    // 4. Generar estadísticas
    const stats = generateStats(nftMappings);

    // 5. Generar el contenido del archivo de mapeo
    const fileContent = `// Mapeo de NFTs - Colección Completa
// Generado automáticamente el ${new Date().toISOString()}
// NO MODIFICAR MANUALMENTE
// Fuente: Contrato ${NFT_CONTRACT_ADDRESS}
// Total de NFTs: ${TOTAL_NFTS}
// Este archivo contiene el mapeo de NFTs con sus rarezas y full set
// Los puntos se asignan en un proceso separado

export interface NFTMapping {
  token_id: number;
  rarity: string;
  is_full_set: boolean;
  metadata?: any;
}

export const NFT_MAPPINGS: NFTMapping[] = ${JSON.stringify(nftMappings, null, 2)};

/**
 * Obtiene el mapeo de un NFT por su ID
 * @param tokenId ID del NFT a consultar
 * @returns Mapeo del NFT o null si no existe
 */
export function getNFTMapping(tokenId: number): NFTMapping | null {
  return NFT_MAPPINGS.find(nft => nft.token_id === tokenId) || null;
}

/**
 * Verifica si un NFT existe en el mapeo
 * @param tokenId ID del NFT a verificar
 * @returns true si el NFT existe en el mapeo, false si no
 */
export function hasNFTMapping(tokenId: number): boolean {
  return NFT_MAPPINGS.some(nft => nft.token_id === tokenId);
}

/**
 * Obtiene todos los NFTs de una rareza específica
 * @param rarity Rareza a buscar
 * @returns Array de NFTs con esa rareza
 */
export function getNFTsByRarity(rarity: string): NFTMapping[] {
  return NFT_MAPPINGS.filter(nft => nft.rarity === rarity);
}

/**
 * Obtiene todos los NFTs con Full Set
 * @returns Array de NFTs con Full Set
 */
export function getFullSetNFTs(): NFTMapping[] {
  return NFT_MAPPINGS.filter(nft => nft.is_full_set);
}
`;

    // 6. Escribir archivo localmente primero (IMPORTANTE: para evitar desfase con GitHub)
    try {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const localPath = pathModule.join(process.cwd(), 'src', 'data', 'nftMappings.ts');
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log('✅ Archivo nftMappings.ts escrito localmente');
    } catch (localError) {
      console.error('❌ Error escribiendo archivo local:', localError);
      // Continuar aunque falle el archivo local
    }

    // 7. Escribir a GitHub
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
        const path = 'src/data/nftMappings.ts';
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
        
        const commitMessage = `feat: Sincronizar mapeo de NFTs - ${new Date().toISOString()}

Total NFTs: ${TOTAL_NFTS} (desde contrato)
Procesados: ${processedCount}
Contrato: ${NFT_CONTRACT_ADDRESS}
Admin: ${adminWallet}

Estadísticas:
${JSON.stringify(stats, null, 2)}

Este archivo contiene solo el mapeo (ID, rareza, full set).
Los puntos se asignan en un proceso separado.

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
      message: `Mapeo de colección sincronizado: ${TOTAL_NFTS} NFTs`,
      totalNFTs: TOTAL_NFTS,
      processedNFTs: processedCount,
      contractAddress: NFT_CONTRACT_ADDRESS,
      stats,
      githubCommit: fileWritten ? commitSha : null,
      mappingFile: 'src/data/nftMappings.ts',
      note: 'Este proceso solo genera el mapeo. Use generate-points-map para asignar puntos.'
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
async function processNFTMetadata(client: any, tokenId: number): Promise<NFTMapping> {
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
    
    // Obtener el valor exacto de rareza (sin modificar ni convertir a lowercase)
    let rarity = rarityAttr?.value || 'original';
    
    // Normalizar nombres de rareza para mantener consistencia
    // Mapear exactamente como vienen del contrato
    if (typeof rarity === 'string') {
      // Mantener el formato exacto esperado
      const rarityMap: Record<string, string> = {
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
    const fullSetAttr = attributes.find((attr: any) => {
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
    console.error(`Error procesando NFT ${tokenId}:`, error);
    // Valor por defecto en caso de error
    return {
      token_id: tokenId,
      rarity: 'original',
      is_full_set: false
    };
  }
}

// Función para generar estadísticas
function generateStats(nftMappings: NFTMapping[]) {
  const rarityDistribution: Record<string, number> = {};
  let fullSetCount = 0;
  
  nftMappings.forEach(nft => {
    // Contar por rareza
    rarityDistribution[nft.rarity] = (rarityDistribution[nft.rarity] || 0) + 1;
    
    // Contar full sets
    if (nft.is_full_set) {
      fullSetCount++;
    }
  });
  
  return {
    totalNFTs: nftMappings.length,
    rarityDistribution,
    fullSetCount,
    rarities: Object.keys(rarityDistribution).sort()
  };
}