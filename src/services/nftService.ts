import { supabase, updateLeaderboard } from '@/utils/supabase';
import { ethers } from 'ethers';
import { abi as ERC721ABI } from '@/utils/erc721-abi'; // You'll need to create this file with the ABI
import { isNFTLocked, lockNFT } from './redisService';

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
 * Gets current NFTs from the blockchain, compares them with those in the database,
 * and removes those that are no longer in the user's wallet.
 */
export async function fetchUserNFTs(provider: ethers.providers.Web3Provider, walletAddress: string) {
  try {
    console.log(`⚡ START: Fetching NFTs for wallet: ${walletAddress}`);
    
    // STEP 1: VERIFY EXISTING NFTS IN DATABASE
    const { data: existingNfts, error: existingError } = await supabase
      .from('nfts')
      .select('token_id, contract_address, rarity, bonus_points')
      .eq('wallet_address', walletAddress.toLowerCase());
    
    if (existingError) {
      console.error('Error checking existing NFTs:', existingError);
    } else {
      console.log(`🔍 EXISTING DB STATE: Found ${existingNfts?.length || 0} NFTs in database for wallet ${walletAddress.toLowerCase()}`);
      if (existingNfts && existingNfts.length > 0) {
        const totalBonusPoints = existingNfts.reduce((sum, nft) => sum + (nft.bonus_points || 0), 0);
        console.log(`⚠️ DB STATE DETAILS: Total bonus points before cleanup: ${totalBonusPoints}`);
        existingNfts.forEach(nft => {
          console.log(`   - NFT #${nft.token_id}: ${nft.rarity || 'unknown'} (${nft.bonus_points || 0} points)`);
        });
      }
    }
    
    // STEP 2: AGGRESSIVELY CLEAN ALL NFTS FOR THIS WALLET
    console.log(`🧹 CLEANUP: Removing ALL existing NFTs for wallet ${walletAddress.toLowerCase()}...`);
    
    // First deletion pass
    const { error: cleanError1 } = await supabase
      .from('nfts')
      .delete()
      .eq('wallet_address', walletAddress.toLowerCase());
    
    if (cleanError1) {
      console.error('❌ CLEANUP ERROR (first attempt):', cleanError1);
      // Try to continue despite the error
    }
    
    // Verify that the deletion was successful
    const { data: remainingNfts, error: checkError } = await supabase
      .from('nfts')
      .select('count')
      .eq('wallet_address', walletAddress.toLowerCase());
    
    if (checkError) {
      console.error('Error verifying cleanup:', checkError);
    } else {
      const count = remainingNfts?.[0]?.count || 0;
      console.log(`🔍 CLEANUP VERIFICATION: ${count} NFTs remain in database after cleanup`);
      
      // If NFTs still remain, try to delete them again
      if (count > 0) {
        console.log(`⚠️ WARNING: First cleanup incomplete, attempting second cleanup...`);
        
        // Second deletion pass to ensure complete cleanup
        const { error: cleanError2 } = await supabase
          .from('nfts')
          .delete()
          .eq('wallet_address', walletAddress.toLowerCase());
        
        if (cleanError2) {
          console.error('❌ CLEANUP ERROR (second attempt):', cleanError2);
        } else {
          console.log(`✅ SECOND CLEANUP complete`);
        }
      }
    }
    
    // Small pause to ensure deletion completes before continuing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // STEP 3: GET FRESH NFTS FROM THE BLOCKCHAIN
    const contract = new ethers.Contract(PRIMOS_NFT_CONTRACT, ERC721ABI, provider);
    
    // Get NFT balance
    const balance = await contract.balanceOf(walletAddress);
    const balanceNum = balance.toNumber();
    
    console.log(`Found ${balanceNum} NFTs in blockchain for wallet ${walletAddress}`);
    
    // Prepare arrays to store the data
    const blockchainNFTIds: number[] = [];
    const nfts = [];
    
    // Iterate over all NFTs and get their IDs
    for (let i = 0; i < balanceNum; i++) {
      const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
      const tokenIdNum = tokenId.toNumber();
      blockchainNFTIds.push(tokenIdNum);
      
      // Try to get the token URI
      const tokenURI = await contract.tokenURI(tokenId);
      
      // Get metadata (this depends on how your contract is implemented)
      let metadata: NFTMetadata | null = null;
      
      if (tokenURI) {
        try {
          // If the URI is an IPFS or HTTPS link
          if (tokenURI.startsWith('ipfs://')) {
            const ipfsHash = tokenURI.replace('ipfs://', '');
            const response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`);
            metadata = await response.json();
          } else if (tokenURI.startsWith('http')) {
            const response = await fetch(tokenURI);
            metadata = await response.json();
          }
        } catch (err) {
          console.error(`Error fetching metadata for token ${tokenIdNum}:`, err);
        }
      }
      
      // Calculate bonus points based on metadata
      let bonusPoints = 0;
      let rarity = '';
      let isShiny = false;
      let isZ = false;
      let isFullSet = false;
      
      console.log(`Processing metadata for NFT #${tokenIdNum}:`, metadata);
      
      if (metadata?.attributes) {
        console.log(`Attributes for NFT #${tokenIdNum}:`, metadata.attributes);
        
        // Determine rarity
        const rarityAttr = metadata.attributes.find(attr => attr.trait_type === 'Rarity');
        if (rarityAttr) {
          rarity = rarityAttr.value as string;
          console.log(`Found rarity for NFT #${tokenIdNum}: "${rarity}"`);
          
          // Calculate bonus points based on rarity
          if (rarity === 'unique') {
            bonusPoints += 30;
            console.log(`  → +30 points for unique rarity`);
          }
          else if (rarity === 'shiny Z') {
            bonusPoints += 13;
            isShiny = true;
            isZ = true;
            console.log(`  → +13 points for shiny Z rarity`);
          }
          else if (rarity === 'shiny') {
            bonusPoints += 7;
            isShiny = true;
            console.log(`  → +7 points for shiny rarity`);
          }
          else if (rarity === 'original Z') {
            bonusPoints += 4;
            isZ = true;
            console.log(`  → +4 points for original Z rarity`);
          }
          else if (rarity === 'original') {
            bonusPoints += 1;
            console.log(`  → +1 point for original rarity`);
          }
        } else {
          console.log(`⚠️ No rarity attribute found for NFT #${tokenIdNum}`);
        }
        
        // Check if it has full set
        const fullSetAttr = metadata.attributes.find(attr => attr.trait_type === 'Full Set');
        if (fullSetAttr && fullSetAttr.value === true) {
          bonusPoints += 2;
          isFullSet = true;
          console.log(`  → +2 points for Full Set attribute`);
        }
      } else {
        console.log(`⚠️ No attributes found in metadata for NFT #${tokenIdNum}`);
      }
      
      console.log(`Final calculation for NFT #${tokenIdNum}: ${bonusPoints} bonus points (rarity: ${rarity}, shiny: ${isShiny}, Z: ${isZ}, fullSet: ${isFullSet})`);
      
      // Save or update the NFT in the database
      const { data, error } = await supabase
        .from('nfts')
        .upsert(
          {
            token_id: tokenIdNum,
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
        )
        .select();
      
      if (error) throw error;
      
      nfts.push({
        tokenId: tokenIdNum,
        metadata,
        bonusPoints,
        rarity,
        isShiny,
        isZ,
        isFullSet
      });
    }
    
    // Now we will insert (or reinsert) all current NFTs from the blockchain
    console.log(`Adding/updating ${blockchainNFTIds.length} current NFTs from blockchain to database`);
    
    try {
      const totalBonusPoints = nfts.reduce((sum, nft) => sum + nft.bonusPoints, 0);
      await updateLeaderboardNFTData(walletAddress, nfts.length, totalBonusPoints);
    } catch (error) {
      console.error('Error updating leaderboard NFT data:', error);
    }
    
    return { success: true, nfts };
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    return { success: false, error };
  }
}

export async function calculateNFTPoints(walletAddress: string, blockNFTs: boolean = false) {
  try {
    console.log(`Calculando puntos de NFTs para wallet ${walletAddress}`);
    const startTime = Date.now();
    
    // Get all of the user's NFTs
    const { data: nfts, error } = await supabase
      .from('nfts')
      .select('token_id, contract_address, bonus_points')
      .eq('wallet_address', walletAddress.toLowerCase());
    
    if (error) throw error;
    
    console.log(`Encontrados ${nfts?.length || 0} NFTs en la base de datos para wallet ${walletAddress}`);
    
    if (!nfts || nfts.length === 0) {
      console.log('No se encontraron NFTs para esta wallet');
      return { success: true, totalPoints: 0, eligibleNfts: [], nftStatusMap: {} };
    }
    
    // Paso 1: Verificar todos los NFTs en paralelo
    console.log(`Iniciando verificación paralela de ${nfts.length} NFTs...`);
    
    // Crear un array de promesas para verificar todos los NFTs simultáneamente
    const lockCheckPromises = nfts.map(async (nft, index) => {
      try {
        const isLocked = await isNFTLocked(nft.contract_address, String(nft.token_id));
        return { 
          nft, 
          isLocked, 
          index 
        };
      } catch (err) {
        console.error(`Error verificando NFT ${nft.contract_address}:${nft.token_id}:`, err);
        // En caso de error, asumimos que está bloqueado para evitar uso incorrecto
        return { nft, isLocked: true, index };
      }
    });
    
    // Esperar a que todas las verificaciones se completen
    const lockCheckResults = await Promise.all(lockCheckPromises);
    
    // Paso 2: Filtrar los NFTs elegibles basados en los resultados
    const eligibleNfts: NFT[] = [];
    let totalPoints = 0;
    
    // Crear un mapa de estado de NFTs (bloqueado/desbloqueado)
    const nftStatusMap: Record<string, boolean> = {};
    
    // Procesar resultados y construir el mapa de estado
    lockCheckResults.forEach(result => {
      // Guardar el estado en el mapa (true = bloqueado, false = disponible)
      nftStatusMap[result.nft.token_id] = result.isLocked;
      
      // Si no está bloqueado, añadir a elegibles
      if (!result.isLocked) {
        eligibleNfts.push(result.nft);
        totalPoints += (result.nft.bonus_points || 0);
      } else {
        console.log(`NFT ${result.nft.contract_address}:${result.nft.token_id} ya está bloqueado, no disponible para wallet ${walletAddress}`);
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
      nftStatusMap  // Return the status map for all NFTs
    };
  } catch (error) {
    console.error('Error calculating NFT points:', error);
    return { success: false, error, totalPoints: 0, eligibleNfts: [], nftStatusMap: {} };
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