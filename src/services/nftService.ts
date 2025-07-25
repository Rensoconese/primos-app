import { supabase } from '@/utils/supabase';
import { updateLeaderboard } from '@/services/leaderboardService';
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
import { isNFTLocked, lockNFT } from './redisService';
import { isNFTListed } from './marketplaceService';
import { getNFTPointsSafe } from '@/data/nftPoints';

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
  bonus_points?: number;
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
    console.log(`⚡ START: Fetching NFTs for wallet: ${walletAddress}`);
    
    // STEP 1: GET NFTS FROM BLOCKCHAIN
    // Usar el publicClient directamente si está disponible, o crearlo si no
    const publicClient = provider.publicClient || createPublicClient({
      chain: ronin,
      transport: custom(provider.provider || provider)
    });
    
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
    
    console.log(`Found ${balanceNum} NFTs in blockchain for wallet ${walletAddress}`);
    
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
      .select('token_id, contract_address, rarity, bonus_points, metadata, is_shiny, is_z, is_full_set')
      .eq('wallet_address', walletAddress.toLowerCase());
    
    if (existingError) {
      console.error('Error checking existing NFTs:', existingError);
      // Continue despite error to try recovery
    } else {
      console.log(`🔍 EXISTING DB STATE: Found ${existingNfts?.length || 0} NFTs in database for wallet ${walletAddress.toLowerCase()}`);
      if (existingNfts && existingNfts.length > 0) {
        const totalBonusPoints = existingNfts.reduce((sum, nft) => sum + (nft.bonus_points || 0), 0);
        console.log(`⚠️ DB STATE DETAILS: Total bonus points before sync: ${totalBonusPoints}`);
      }
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
      } else {
        // Only update if needed (e.g., if bonus points changed)
        const existingNft = existingNftsMap.get(tokenId);
        const currentPoints = getNFTPointsSafe(String(tokenId), 0);
        
        if (existingNft.bonus_points !== currentPoints) {
          nftsToUpdate.push(tokenId);
        }
      }
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
    
    console.log(`Sync plan: Add ${nftsToAdd.length}, Update ${nftsToUpdate.length}, Remove ${nftsToRemove.length} NFTs`);
    
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
    
    // STEP 5: PROCESS ADDITIONS AND UPDATES
    const nftsToProcess = [...nftsToAdd, ...nftsToUpdate];
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
            bonus_points: bonusPoints,
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
        bonusPoints: nft.bonus_points || 0,
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
      
      await updateLeaderboardNFTData(walletAddress, blockchainNFTIds.length, totalBonusPoints);
    } catch (error) {
      console.error('Error updating leaderboard NFT data:', error);
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
      .select('token_id, contract_address, bonus_points')
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
    
    // Step 1: Verify all NFTs in parallel (both locking and marketplace listing)
    console.log(`Starting parallel verification of ${nfts.length} NFTs...`);
    
    // Crear un array de promesas para verificar todos los NFTs simultáneamente
    const checkPromises = nfts.map(async (nft, index) => {
      try {
        // Verificar si el NFT está bloqueado (usado hoy)
        const isLocked = await isNFTLocked(nft.contract_address, String(nft.token_id));
        
        // Verificar si el NFT está listado en el marketplace
        const isListed = await isNFTListed(nft.contract_address, String(nft.token_id), walletAddress);
        
        // Un NFT no está disponible si está bloqueado O listado en el marketplace
        const isUnavailable = isLocked || isListed;
        
        return { 
          nft, 
          isUnavailable,
          isLocked,
          isListed,
          index 
        };
      } catch (err) {
        console.error(`Error verificando NFT ${nft.contract_address}:${nft.token_id}:`, err);
        // En caso de error, asumimos que está bloqueado para evitar uso incorrecto
        return { nft, isUnavailable: true, isLocked: true, isListed: false, index };
      }
    });
    
    // Esperar a que todas las verificaciones se completen
    const checkResults = await Promise.all(checkPromises);
    
    // Paso 2: Filtrar los NFTs elegibles basados en los resultados
    const eligibleNfts: NFT[] = [];
    let totalPoints = 0;
    
    // Crear mapas de estado de NFTs
    const nftStatusMap: Record<string, boolean> = {}; // true = no disponible, false = disponible
    const lockedNFTsMap: Record<string, boolean> = {}; // true = bloqueado por uso, false = no bloqueado
    const listedNFTsMap: Record<string, boolean> = {}; // true = listado en marketplace, false = no listado
    
    // Procesar resultados y construir los mapas de estado
    checkResults.forEach(result => {
      // Guardar el estado en los mapas
      const tokenId = String(result.nft.token_id);
      nftStatusMap[tokenId] = result.isUnavailable;
      lockedNFTsMap[tokenId] = result.isLocked;
      listedNFTsMap[tokenId] = result.isListed;
      
      // Si está disponible, añadir a elegibles
      if (!result.isUnavailable) {
        // Obtener puntos del mapa precalculado
        const bonusPoints = getNFTPointsSafe(tokenId, result.nft.bonus_points || 0);
        
        // Actualizar los puntos en el objeto NFT
        const nftWithUpdatedPoints = {
          ...result.nft,
          bonus_points: bonusPoints
        };
        
        eligibleNfts.push(nftWithUpdatedPoints);
        totalPoints += bonusPoints;
        
        console.log(`NFT ${result.nft.contract_address}:${tokenId} available with ${bonusPoints} points`);
      } else {
        if (result.isLocked) {
          console.log(`NFT ${result.nft.contract_address}:${tokenId} is already locked, not available for wallet ${walletAddress}`);
        }
        if (result.isListed) {
          console.log(`NFT ${result.nft.contract_address}:${tokenId} is listed in the marketplace, not available for wallet ${walletAddress}`);
        }
      }
    });
    
    // Paso 3: Si es necesario, bloquear los NFTs elegibles en paralelo
    if (blockNFTs && eligibleNfts.length > 0) {
      console.log(`Bloqueando ${eligibleNfts.length} NFTs elegibles en paralelo...`);
      
      // Crear un array de promesas para bloquear todos los NFTs elegibles simultáneamente
      const lockPromises = eligibleNfts.map(async (nft) => {
        try {
          const lockResult = await lockNFT(nft.contract_address, String(nft.token_id), walletAddress);
          console.log(`NFT ${nft.contract_address}:${nft.token_id} ${lockResult ? 'bloqueado' : 'no se pudo bloquear'} para wallet ${walletAddress}`);
          return { nft, success: lockResult };
        } catch (err) {
          console.error(`Error bloqueando NFT ${nft.contract_address}:${nft.token_id}:`, err);
          return { nft, success: false };
        }
      });
      
      // Esperar a que todos los bloqueos se completen
      await Promise.all(lockPromises);
    }
    
    const endTime = Date.now();
    const executionTime = (endTime - startTime) / 1000;
    
    console.log(`Total de NFTs elegibles: ${eligibleNfts.length}, Total de puntos: ${totalPoints}`);
    console.log(`Tiempo de ejecución: ${executionTime.toFixed(2)} segundos`);
    
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
    
    // Bloquear los NFTs en paralelo
    const lockPromises = nfts.map(async (nft) => {
      try {
        const lockResult = await lockNFT(nft.contract_address, String(nft.token_id), walletAddress);
        console.log(`NFT ${nft.contract_address}:${nft.token_id} ${lockResult ? 'bloqueado' : 'no se pudo bloquear'} para wallet ${walletAddress}`);
        return { nft, success: lockResult };
      } catch (err) {
        console.error(`Error bloqueando NFT ${nft.contract_address}:${nft.token_id}:`, err);
        return { nft, success: false };
      }
    });
    
    // Esperar a que todos los bloqueos se completen
    const results = await Promise.all(lockPromises);
    
    // Contar cuántos NFTs se bloquearon exitosamente
    const blockedCount = results.filter(result => result.success).length;
    
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


export async function updateLeaderboardNFTData(walletAddress: string, nftCount: number, totalBonusPoints: number) {
  try {
    // Usar la función centralizada para actualizar el leaderboard
    const result = await updateLeaderboard(walletAddress, {
      nft_count: nftCount,
      last_active: new Date().toISOString()
    });
    
    return result;
  } catch (error) {
    console.error('Error updating leaderboard NFT data:', error);
    return { success: false, error };
  }
}
