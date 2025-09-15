import { supabase } from '@/utils/supabase';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  custom, 
  type PublicClient, 
  type WalletClient,
  type Address,
  getContract,
  parseEther,
  formatEther
} from 'viem';
import { ronin } from '@/utils/chain';
import { ERC721_ABI } from '@/utils/erc721-abi';
import { isNFTLockedV2, lockNFTV2, batchCheckNFTLocksV2, batchLockNFTsV2 } from './redisService';
import { isNFTListed } from './marketplaceService';
import { getNFTPointsSafe } from '@/data/nftPoints';
import { 
  isRoninNetwork, 
  processNetworkError, 
  getNetworkErrorMessage 
} from '@/utils/contract';

// Primos NFT contract address
export const PRIMOS_NFT_CONTRACT = '0x23924869ff64ab205b3e3be388a373d75de74ebd';

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: {
    trait_type: string;
    value: string | boolean;
    display_type?: string;
  }[];
}

export interface NFT {
  token_id: string | number;
  contract_address: string;
  rarity?: string;
  is_shiny?: boolean;
  is_z?: boolean;
  is_full_set?: boolean;
  wallet_address?: string;
  metadata?: NFTMetadata;
}

/**
 * Synchronizes user NFTs between the blockchain and the database
 * Uses a compare-and-update strategy instead of delete-and-reinsert
 */
export async function fetchUserNFTs(provider: any, walletAddress: string) {
  try {
    
    // STEP 1: GET NFTS FROM BLOCKCHAIN
    // Usar el publicClient directamente si está disponible, o crearlo si no
    const publicClient = provider.publicClient || createPublicClient({
      chain: ronin,
      transport: custom(provider.provider || provider)
    });
    
    // Verify we're on the correct network
    const currentChainId = publicClient.chain?.id;
    if (!isRoninNetwork(currentChainId)) {
      const errorMessage = getNetworkErrorMessage(currentChainId);
      console.error('Network mismatch detected:', errorMessage);
      throw new Error(errorMessage);
    }
    
    // Crear un contrato usando viem
    const contract = {
      address: PRIMOS_NFT_CONTRACT as Address,
      abi: ERC721_ABI
    };
    
    // Obtener el balance de NFTs
    const balance = await publicClient.readContract({
      ...contract,
      functionName: 'balanceOf',
      args: [walletAddress as Address]
    });
    const balanceNum = Number(balance);
    
    // Get all token IDs from blockchain
    const blockchainNFTIds: number[] = [];
    for (let i = 0; i < balanceNum; i++) {
      const tokenId = await publicClient.readContract({
        ...contract,
        functionName: 'tokenOfOwnerByIndex',
        args: [walletAddress as Address, BigInt(i)]
      });
      blockchainNFTIds.push(Number(tokenId));
    }
    
    // STEP 2: GET EXISTING NFTS FROM DATABASE
    const { data: existingNfts, error: existingError } = await supabase
      .from('nfts')
      .select('token_id, contract_address, rarity, metadata, is_shiny, is_z, is_full_set')
      .eq('wallet_address', walletAddress.toLowerCase());
    
    if (existingError) {
      console.error('Error checking existing NFTs:', existingError);
      // Continue despite error to try recovery
    }
    
    // Create a map of existing NFTs for easy lookup
    const existingNftsMap = new Map();
    if (existingNfts) {
      existingNfts.forEach(nft => {
        existingNftsMap.set(Number(nft.token_id), nft);
      });
    }
    
    // STEP 3: IDENTIFY NFTS TO ADD, UPDATE, OR REMOVE
    const nftsToAdd: number[] = [];
    const nftsToUpdate: number[] = [];
    const nftsToRemove: number[] = [];
    
    // Find NFTs to add or update
    for (const tokenId of blockchainNFTIds) {
      if (!existingNftsMap.has(tokenId)) {
        nftsToAdd.push(tokenId);
      }
      // Note: No need to check for updates since we removed bonus_points column
      // NFT data is now calculated dynamically from rarity
    }
    
    // Find NFTs to remove (in DB but not in blockchain)
    if (existingNfts) {
      for (const nft of existingNfts) {
        const tokenId = Number(nft.token_id);
        if (!blockchainNFTIds.includes(tokenId)) {
          nftsToRemove.push(tokenId);
        }
      }
    }
    
    // Only log if there are actual changes
    if (nftsToAdd.length > 0 || nftsToUpdate.length > 0 || nftsToRemove.length > 0) {
      console.log(`NFT sync: Add ${nftsToAdd.length}, Update ${nftsToUpdate.length}, Remove ${nftsToRemove.length}`);
    }
    
    // STEP 4: PROCESS REMOVALS
    if (nftsToRemove.length > 0) {
      const { error: removeError } = await supabase
        .from('nfts')
        .delete()
        .eq('wallet_address', walletAddress.toLowerCase())
        .in('token_id', nftsToRemove);
      
      if (removeError) {
        console.error('Error removing NFTs:', removeError);
      } else {
        console.log(`✅ Removed ${nftsToRemove.length} NFTs that are no longer in the wallet`);
      }
    }
    
    // STEP 5: PROCESS ADDITIONS ONLY (no updates needed)
    const nftsToProcess = nftsToAdd;
    const processedNfts: Array<{
      tokenId: number;
      metadata?: NFTMetadata;
      bonusPoints: number;
      rarity: string;
      isShiny: boolean;
      isZ: boolean;
      isFullSet: boolean;
    }> = [];
    
    for (const tokenId of nftsToProcess) {
      // Get token URI and metadata if needed
      let metadata: NFTMetadata | null = null;
      let tokenURI = null;
      
      try {
        // Obtener tokenURI usando viem
        tokenURI = await publicClient.readContract({
          ...contract,
          functionName: 'tokenURI',
          args: [BigInt(tokenId)]
        });
        
        // Only fetch metadata if this is a new NFT or we need to update
        if (tokenURI) {
          if (tokenURI.startsWith('ipfs://')) {
            const ipfsHash = tokenURI.replace('ipfs://', '');
            const response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`);
            metadata = await response.json();
          } else if (tokenURI.startsWith('http')) {
            const response = await fetch(tokenURI);
            metadata = await response.json();
          }
        }
      } catch (err) {
        console.error(`Error fetching metadata for token ${tokenId}:`, err);
      }
      
      // Get points from precalculated map
      const bonusPoints = getNFTPointsSafe(String(tokenId), 0);
      console.log(`Processing NFT #${tokenId} - Puntos: ${bonusPoints}`);
      
      // Extract basic info from metadata for storage
      let rarity = '';
      let isShiny = false;
      let isZ = false;
      let isFullSet = false;
      
      if (metadata?.attributes) {
        const rarityAttr = metadata.attributes.find(attr => attr.trait_type === 'Rarity');
        if (rarityAttr) {
          rarity = rarityAttr.value as string;
        }
        
        const fullSetAttr = metadata.attributes.find(attr => attr.trait_type === 'Full Set');
        if (fullSetAttr && fullSetAttr.value === true) {
          isFullSet = true;
        }
        
        if (rarity) {
          isShiny = rarity.toLowerCase().includes('shiny');
          isZ = rarity.toLowerCase().includes('z');
        }
      }
      
      // Save or update the NFT in the database
      const { error } = await supabase
        .from('nfts')
        .upsert(
          {
            token_id: tokenId,
            wallet_address: walletAddress.toLowerCase(),
            contract_address: PRIMOS_NFT_CONTRACT.toLowerCase(),
            rarity,
            is_shiny: isShiny,
            is_z: isZ,
            is_full_set: isFullSet,
            metadata: metadata || {},
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'token_id,contract_address'
          }
        );
      
      if (error) {
        console.error(`Error saving NFT ${tokenId}:`, error);
      } else {
        processedNfts.push({
          tokenId,
          metadata: metadata || undefined,
          bonusPoints,
          rarity,
          isShiny,
          isZ,
          isFullSet
        });
      }
    }
    
    // STEP 6: PREPARE RETURN DATA
    // If we processed any NFTs, return those. Otherwise, return existing NFTs
    let returnNfts: Array<{
      tokenId: number;
      metadata?: NFTMetadata;
      bonusPoints: number;
      rarity?: string;
      isShiny?: boolean;
      isZ?: boolean;
      isFullSet?: boolean;
    }> = [];
    
    if (processedNfts.length > 0) {
      returnNfts = processedNfts;
    } else if (existingNfts) {
      // Convert existing NFTs to the expected format
      returnNfts = existingNfts.map(nft => ({
        tokenId: Number(nft.token_id),
        metadata: nft.metadata,
        bonusPoints: getNFTPointsSafe(String(nft.token_id), 0),
        rarity: nft.rarity,
        isShiny: nft.is_shiny || false,
        isZ: nft.is_z || false,
        isFullSet: nft.is_full_set || false
      }));
    }
    
    // STEP 7: UPDATE LEADERBOARD
    try {
      // Calculate total bonus points from all NFTs
      const totalBonusPoints = blockchainNFTIds.reduce((sum, tokenId) => {
        return sum + getNFTPointsSafe(String(tokenId), 0);
      }, 0);
    } catch (error) {
      console.error('Error calculating NFT bonus points:', error);
    }
    
    // STEP 8: CHECK MARKETPLACE LISTINGS
    // Por ahora, asumimos que ningún NFT está listado en el marketplace
    // Esto se puede mejorar más adelante con una implementación adecuada
    returnNfts = returnNfts.map(nft => ({
      ...nft,
      isListed: false
    }));
    
    return { success: true, nfts: returnNfts };
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    
    // Check if it's a network-related error
    const networkError = processNetworkError(error);
    if (networkError) {
      return { success: false, error: new Error(networkError) };
    }
    
    return { success: false, error };
  }
}

export async function calculateNFTPoints(walletAddress: string, blockNFTs: boolean = false) {
  try {
    console.log(`Calculating NFT points for wallet ${walletAddress}`);
    const startTime = Date.now();
    
    // Get all of the user's NFTs
    const { data: nfts, error } = await supabase
      .from('nfts')
      .select('token_id, contract_address')
      .eq('wallet_address', walletAddress.toLowerCase());
    
    if (error) throw error;
    
    console.log(`Found ${nfts?.length || 0} NFTs in database for wallet ${walletAddress}`);
    
    if (!nfts || nfts.length === 0) {
      console.log('No NFTs found for this wallet');
      return { 
        success: true, 
        totalPoints: 0, 
        eligibleNfts: [], 
        nftStatusMap: {},
        lockedNFTsMap: {},
        listedNFTsMap: {}
      };
    }
    
    // Step 1: Check NFT blocks in DATABASE first (más confiable)
    const tokenIds = nfts.map(nft => String(nft.token_id));
    const contractAddress = nfts[0]?.contract_address || PRIMOS_NFT_CONTRACT;
    
    // Verificar bloqueos en Redis 
    // NOTA: El bloqueo en la base de datos se verifica solo en el servidor (API routes)
    console.log('Checking NFT locks in Redis...');
    const redisLockedMap = await batchCheckNFTLocksV2(contractAddress, tokenIds);
    
    // Usar solo el estado de Redis para el cliente
    const lockedStatusMap = new Map<string, boolean>();
    tokenIds.forEach(tokenId => {
      const redisLocked = redisLockedMap.get(tokenId) || false;
      lockedStatusMap.set(tokenId, redisLocked);
    });
    
    // Process results - no need for Promise.all since Redis check is already done
    const checkResults = nfts.map((nft, index) => {
      const tokenId = String(nft.token_id);
      const isLocked = lockedStatusMap.get(tokenId) || false;
      
      // SKIP marketplace check for performance (temporarily disabled)
      const isListed = false;
      
      // Un NFT no está disponible si está bloqueado O listado en el marketplace
      const isUnavailable = isLocked || isListed;
      
      return {
        nft,
        isUnavailable,
        isLocked,
        isListed,
        index
      };
    });
    
    // Paso 2: Filtrar los NFTs elegibles basados en los resultados
    const eligibleNfts: NFT[] = [];
    let totalPoints = 0;
    
    // Crear mapas de estado de NFTs
    const nftStatusMap: Record<string, boolean> = {}; // true = no disponible, false = disponible
    const lockedNFTsMap: Record<string, boolean> = {}; // true = bloqueado por uso, false = no bloqueado
    const listedNFTsMap: Record<string, boolean> = {}; // true = listado en marketplace, false = no listado
    
    // Procesar resultados y construir los mapas de estado
    let totalBlockedByMarketplace = 0;
    let totalBlockedByUsage = 0;
    let marketplaceBlockedPoints = 0;
    let usageBlockedPoints = 0;
    
    checkResults.forEach(result => {
      // Guardar el estado en los mapas
      const tokenId = String(result.nft.token_id);
      nftStatusMap[tokenId] = result.isUnavailable;
      lockedNFTsMap[tokenId] = result.isLocked;
      listedNFTsMap[tokenId] = result.isListed;
      
      // Obtener puntos del mapa precalculado para conteo
      const bonusPoints = getNFTPointsSafe(tokenId, 0);
      
      // Si está disponible, añadir a elegibles
      if (!result.isUnavailable) {
        // No need to update bonus_points since we removed it from the interface
        eligibleNfts.push(result.nft);
        totalPoints += bonusPoints;
        
        console.log(`✅ NFT ${result.nft.contract_address}:${tokenId} AVAILABLE with ${bonusPoints} points`);
      } else {
        if (result.isLocked) {
          totalBlockedByUsage++;
          usageBlockedPoints += bonusPoints;
          console.log(`🔒 NFT ${result.nft.contract_address}:${tokenId} BLOCKED by daily usage (${bonusPoints} points lost)`);
        }
        if (result.isListed) {
          totalBlockedByMarketplace++;
          marketplaceBlockedPoints += bonusPoints;
          console.log(`🏪 NFT ${result.nft.contract_address}:${tokenId} BLOCKED by marketplace listing (${bonusPoints} points lost)`);
        }
      }
    });
    
    // Log de resumen detallado
    console.log(`\n📊 RESUMEN DE CÁLCULO DE PUNTOS:`);
    console.log(`Total NFTs verificados: ${checkResults.length}`);
    console.log(`NFTs disponibles: ${eligibleNfts.length}`);
    console.log(`NFTs bloqueados por uso diario: ${totalBlockedByUsage} (${usageBlockedPoints} puntos)`);
    console.log(`NFTs bloqueados por marketplace: ${totalBlockedByMarketplace} (${marketplaceBlockedPoints} puntos)`);
    console.log(`PUNTOS TOTALES ELEGIBLES: ${totalPoints}`);
    
    // Paso 3: Si es necesario, bloquear los NFTs elegibles usando batch operation
    if (blockNFTs && eligibleNfts.length > 0) {
      console.log(`Bloqueando ${eligibleNfts.length} NFTs elegibles con batch operation...`);
      
      // Usar batch lock para bloquear todos los NFTs en una sola operación Redis
      const eligibleTokenIds = eligibleNfts.map(nft => String(nft.token_id));
      const lockResults = await batchLockNFTsV2(contractAddress, eligibleTokenIds, walletAddress);
      
      // Log summary of results
      const successCount = Array.from(lockResults.values()).filter(success => success).length;
      console.log(`Batch lock completado: ${successCount}/${eligibleNfts.length} NFTs bloqueados exitosamente`);
    }
    
    // Removed duplicate logs, already logged above
    
    return { 
      success: true, 
      totalPoints,
      eligibleNfts, // Return eligible NFTs to use in the registry
      nftStatusMap,  // Return the status map for all NFTs
      lockedNFTsMap, // Return map of NFTs locked by daily usage
      listedNFTsMap  // Return map of NFTs listed in marketplace
    };
  } catch (error) {
    console.error('Error calculating NFT points:', error);
    return { 
      success: false, 
      error, 
      totalPoints: 0, 
      eligibleNfts: [], 
      nftStatusMap: {},
      lockedNFTsMap: {},
      listedNFTsMap: {}
    };
  }
}

/**
 * Bloquea NFTs específicos sin recalcular puntos
 * Esta función es más eficiente cuando ya conocemos los NFTs que queremos bloquear
 */
export async function blockSpecificNFTs(walletAddress: string, nftIds: string[]) {
  try {
    console.log(`Bloqueando ${nftIds.length} NFTs específicos para wallet ${walletAddress}`);
    const startTime = Date.now();
    
    if (!nftIds || nftIds.length === 0) {
      console.log('No se proporcionaron NFTs para bloquear');
      return { success: true, blockedCount: 0 };
    }
    
    // Obtener los NFTs específicos de la base de datos
    const { data: nfts, error } = await supabase
      .from('nfts')
      .select('token_id, contract_address')
      .eq('wallet_address', walletAddress.toLowerCase())
      .in('token_id', nftIds);
    
    if (error) throw error;
    
    console.log(`Encontrados ${nfts?.length || 0} NFTs en la base de datos para bloquear`);
    
    if (!nfts || nfts.length === 0) {
      return { success: true, blockedCount: 0 };
    }
    
    // Bloquear los NFTs usando batch operation
    const contractAddress = nfts[0]?.contract_address || PRIMOS_NFT_CONTRACT;
    const tokenIds = nfts.map(nft => String(nft.token_id));
    const lockResults = await batchLockNFTsV2(contractAddress, tokenIds, walletAddress);
    
    // Contar cuántos NFTs se bloquearon exitosamente
    const blockedCount = Array.from(lockResults.values()).filter(success => success).length;
    
    const endTime = Date.now();
    const executionTime = (endTime - startTime) / 1000;
    
    console.log(`Se bloquearon ${blockedCount} NFTs de ${nfts.length}`);
    console.log(`Tiempo de ejecución: ${executionTime.toFixed(2)} segundos`);
    
    return { 
      success: true, 
      blockedCount
    };
  } catch (error) {
    console.error('Error bloqueando NFTs específicos:', error);
    return { success: false, error, blockedCount: 0 };
  }
}


