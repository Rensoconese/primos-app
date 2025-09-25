import { NextResponse } from 'next/server';
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
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const MORALIS_API_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';

// Interface para el mapeo de NFTs
interface NFTMapping {
  token_id: number;
  rarity: string;
  is_full_set: boolean;
}

// Interface para la respuesta de Moralis
interface MoralisNFTResponse {
  token_id: string;
  token_address: string;
  metadata?: string | null;
}

// Función para obtener NFTs de Moralis con paginación
async function fetchNFTsFromMoralis(
  contractAddress: string,
  cursor?: string
): Promise<{
  result: MoralisNFTResponse[];
  cursor?: string;
  page_size: number;
  total?: number;
  status?: string;
}> {
  const url = new URL(`${MORALIS_API_BASE_URL}/nft/${contractAddress}`);
  url.searchParams.append('chain', 'ronin');
  url.searchParams.append('format', 'decimal');
  url.searchParams.append('normalizeMetadata', 'true'); // Cambiar a true para obtener metadata
  url.searchParams.append('limit', '100');
  url.searchParams.append('media_items', 'false');
  
  if (cursor) {
    url.searchParams.append('cursor', cursor);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'X-API-Key': MORALIS_API_KEY!,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Moralis API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Pre-calculados: Token IDs que tienen Full Set (nunca cambian)
// Extraídos del mapeo actual - Total: 188 NFTs con full_set=true
const FULL_SET_TOKEN_IDS = new Set([
  1, 4, 7, 11, 20, 59, 74, 83, 108, 115, 123, 151, 165, 167, 181, 200, 218, 219, 220, 224,
  232, 236, 243, 258, 280, 291, 302, 303, 321, 328, 331, 363, 366, 389, 414, 421, 422, 427,
  436, 444, 475, 499, 507, 513, 554, 577, 604, 634, 660, 662, 667, 677, 714, 725, 726, 734,
  743, 759, 776, 782, 826, 842, 859, 870, 887, 895, 947, 983, 1007, 1015, 1032, 1073, 1079,
  1084, 1101, 1103, 1104, 1108, 1114, 1124, 1127, 1132, 1133, 1135, 1147, 1149, 1153, 1165,
  1169, 1170, 1185, 1210, 1250, 1263, 1312, 1315, 1326, 1337, 1350, 1395, 1416, 1459, 1479,
  1519, 1521, 1543, 1547, 1574, 1596, 1624, 1640, 1668, 1681, 1683, 1685, 1697, 1721, 1735,
  1748, 1805, 1848, 1868, 1907, 1911, 1921, 1946, 1976, 1986, 2000, 2010, 2030, 2032, 2040,
  2052, 2083, 2102, 2108, 2128, 2196, 2216, 2218, 2221, 2228, 2231, 2238, 2249, 2253, 2285,
  2305, 2327, 2338, 2355, 2361, 2366, 2372, 2380, 2386, 2399, 2400, 2409, 2433, 2450, 2462,
  2477, 2500, 2505, 2526, 2562, 2586, 2588, 2595, 2603, 2627, 2657, 2665, 2702, 2737, 2756,
  2768, 2780, 2822, 2824, 2843, 2860, 2869, 2879, 2885, 2966
]);

// Regex optimizado para extraer rareza sin parsear JSON completo
// Busca el patrón: {"trait_type":"Rarity","value":"VALOR_AQUI"}
const RARITY_REGEX = /"trait_type"\s*:\s*"[Rr]arity"\s*,\s*"value"\s*:\s*"([^"]+)"/;

// Función optimizada - SOLO extrae rareza
function extractRarityFromMoralis(nft: MoralisNFTResponse): string {
  // Extraer rareza con regex (más rápido que JSON.parse)
  if (nft.metadata && typeof nft.metadata === 'string') {
    const match = nft.metadata.match(RARITY_REGEX);
    if (match && match[1]) {
      // Mapear rareza directamente
      const rarityMap: Record<string, string> = {
        'original': 'original',
        'original z': 'original Z',
        'original z summer': 'original Z summer',
        'shiny': 'shiny',
        'shiny z': 'shiny Z',
        'shiny z summer': 'shiny Z summer',
        'unique': 'unique'
      };
      
      const lowerRarity = match[1].toLowerCase();
      return rarityMap[lowerRarity] || match[1];
    }
  }
  
  return 'original'; // valor por defecto
}

// FUNCIÓN SIMPLE: Fetch solo rarezas y construir array final
async function fetchAllNFTsOptimized(contractAddress: string): Promise<NFTMapping[]> {
  console.log('⚡ Iniciando sincronización ULTRA-EFICIENTE...');
  
  // Map para almacenar solo rarezas (key: tokenId, value: rarity)
  const raritiesMap = new Map<number, string>();
  
  // Primera página
  const firstResponse = await fetchNFTsFromMoralis(contractAddress);
  if (!firstResponse.result || firstResponse.result.length === 0) {
    return [];
  }
  
  // Solo extraer rarezas, no crear objetos completos aún
  for (const nft of firstResponse.result) {
    const tokenId = parseInt(nft.token_id);
    const rarity = extractRarityFromMoralis(nft);
    raritiesMap.set(tokenId, rarity);
  }
  
  if (!firstResponse.cursor) {
    // Solo una página, construir array final
    return buildFinalArray(raritiesMap);
  }
  
  const MAX_CONCURRENT = 10; // 10 solicitudes paralelas
  let activeFetches = new Map<string, Promise<any>>();
  let pendingCursors = [firstResponse.cursor];
  let processedCount = 1;
  let totalProcessed = raritiesMap.size;
  
  console.log(`🚀 Procesando con ${MAX_CONCURRENT} solicitudes paralelas...`);
  
  // Función para procesar un cursor
  const processCursor = async (cursor: string): Promise<void> => {
    try {
      const response = await fetchNFTsFromMoralis(contractAddress, cursor);
      
      if (response && response.result && response.result.length > 0) {
        // Solo extraer rarezas
        for (const nft of response.result) {
          const tokenId = parseInt(nft.token_id);
          const rarity = extractRarityFromMoralis(nft);
          raritiesMap.set(tokenId, rarity);
        }
        
        totalProcessed = raritiesMap.size;
        processedCount++;
        
        // Si hay más páginas, agregar el cursor
        if (response.cursor) {
          pendingCursors.push(response.cursor);
        }
        
        // Log de progreso cada 5 páginas
        if (processedCount % 5 === 0) {
          console.log(`📊 Progreso: ${totalProcessed} NFTs, ${processedCount} páginas procesadas`);
        }
      }
    } catch (error) {
      console.error('Error en página:', error);
    }
  };
  
  // Mantener el pool de solicitudes activas
  while (pendingCursors.length > 0 || activeFetches.size > 0) {
    // Llenar el pool hasta MAX_CONCURRENT
    while (activeFetches.size < MAX_CONCURRENT && pendingCursors.length > 0) {
      const cursor = pendingCursors.shift()!;
      const fetchId = `fetch_${Date.now()}_${Math.random()}`;
      
      const fetchPromise = processCursor(cursor).finally(() => {
        activeFetches.delete(fetchId);
      });
      
      activeFetches.set(fetchId, fetchPromise);
    }
    
    // Esperar a que al menos una solicitud termine
    if (activeFetches.size > 0) {
      await Promise.race(activeFetches.values());
    }
  }
  
  console.log(`✅ Total procesado: ${totalProcessed} NFTs en ${processedCount} páginas`);
  
  // Construir array final con todos los datos inmutables pre-calculados
  return buildFinalArray(raritiesMap);
}

// Función para construir el array final con datos inmutables pre-calculados
function buildFinalArray(raritiesMap: Map<number, string>): NFTMapping[] {
  const finalArray: NFTMapping[] = [];
  
  // Generar array de 1 a 3000 con full_set pre-calculado
  for (let tokenId = 1; tokenId <= 3000; tokenId++) {
    finalArray.push({
      token_id: tokenId,
      rarity: raritiesMap.get(tokenId) || 'original', // Usar rareza fetched o default
      is_full_set: FULL_SET_TOKEN_IDS.has(tokenId)   // Pre-calculado, no verificar
    });
  }
  
  return finalArray;
}

// Función removida - ya no se usa

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

    // Verificar que tenemos la API key de Moralis
    if (!MORALIS_API_KEY) {
      return NextResponse.json(
        { error: 'Moralis API key no configurada' },
        { status: 500 }
      );
    }

    console.log('🚀 Iniciando sincronización ULTRA-EFICIENTE con Moralis...');
    const startTime = Date.now();

    // Usar la función simple optimizada
    const allNFTs = await fetchAllNFTsOptimized(NFT_CONTRACT_ADDRESS);
    
    const fetchTime = Date.now() - startTime;
    console.log(`⚡ Sincronización completa en ${(fetchTime / 1000).toFixed(1)} segundos`);
    
    console.log(`✅ Total: ${allNFTs.length} NFTs procesados`);
    
    // Ordenar por token_id
    allNFTs.sort((a, b) => a.token_id - b.token_id);
    
    // Generar estadísticas
    const stats = generateStats(allNFTs);

    // Generar el contenido del archivo de mapeo (SIN metadatos completos)
    const fileContent = `// Mapeo de NFTs - Colección Completa
// Generado automáticamente el ${new Date().toISOString()}
// NO MODIFICAR MANUALMENTE
// Fuente: Contrato ${NFT_CONTRACT_ADDRESS} via Moralis API
// Total de NFTs: ${allNFTs.length}
// Tiempo de sincronización: ${(fetchTime / 1000).toFixed(1)} segundos
// Este archivo contiene el mapeo de NFTs con sus rarezas y full set
// Los puntos se asignan en un proceso separado

export interface NFTMapping {
  token_id: number;
  rarity: string;
  is_full_set: boolean;
}

export const NFT_MAPPINGS: NFTMapping[] = ${JSON.stringify(allNFTs, null, 2)};

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

    // Escribir archivo localmente primero
    try {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const localPath = pathModule.join(process.cwd(), 'src', 'data', 'nftMappings.ts');
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log('✅ Archivo nftMappings.ts escrito localmente');
    } catch (localError) {
      console.error('❌ Error escribiendo archivo local:', localError);
    }

    // Escribir a GitHub con reintentos
    let fileWritten = false;
    let commitSha = '';
    
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        console.log('📤 Subiendo archivo a GitHub...');
        
        const octokit = new Octokit({
          auth: githubToken,
          request: {
            timeout: 30000
          }
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
        
        const commitMessage = `feat: Sincronizar mapeo de NFTs via Moralis - ${new Date().toISOString()}

Total NFTs: ${allNFTs.length}
Tiempo: ${(fetchTime / 1000).toFixed(1)} segundos
Contrato: ${NFT_CONTRACT_ADDRESS}
Admin: ${adminWallet}

Estadísticas:
${JSON.stringify(stats, null, 2)}

🤖 Generated with [Claude Code](https://claude.ai/code)`;

        const commitData = await octokit.rest.repos.createOrUpdateFileContents({
          owner, repo, path,
          message: commitMessage,
          content: Buffer.from(fileContent).toString('base64'),
          sha: currentFileSha || undefined,
          branch,
        });
        
        commitSha = commitData.data.commit.sha || '';
        fileWritten = true;
        console.log(`✅ Archivo sincronizado en GitHub: ${commitSha}`);
        
      } else {
        console.log('⚠️ GITHUB_TOKEN no configurado');
      }
    } catch (githubError) {
      console.error('❌ Error subiendo a GitHub:', githubError);
    }

    // Calcular tamaño del archivo
    const fileSizeKB = Math.round(Buffer.byteLength(fileContent, 'utf8') / 1024);

    return NextResponse.json({
      success: true,
      message: `Mapeo sincronizado: ${allNFTs.length} NFTs en ${(fetchTime / 1000).toFixed(1)}s`,
      totalNFTs: allNFTs.length,
      contractAddress: NFT_CONTRACT_ADDRESS,
      stats,
      githubCommit: fileWritten ? commitSha : null,
      localFileWritten: true,
      mappingFile: 'src/data/nftMappings.ts',
      fileSizeKB,
      syncTimeSeconds: (fetchTime / 1000).toFixed(1),
      method: 'Moralis Web3 Data API (optimizado)',
      note: 'Este proceso solo genera el mapeo. Use generate-points-map para asignar puntos.'
    });

  } catch (error) {
    console.error('Error en sync-full-collection:', error);
    return NextResponse.json(
      { 
        error: 'Error al sincronizar colección',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
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