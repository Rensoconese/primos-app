'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  createPublicClient, 
  custom, 
  type PublicClient,
  type Address
} from 'viem';
import { ronin } from '@/utils/chain';
import { fetchUserNFTs, calculateNFTPoints, PRIMOS_NFT_CONTRACT } from '@/services/nftService';
import { supabase } from '@/utils/supabase';
import HowRewardsWorks from './HowRewardsWorks';
import { isNFTLocked } from '@/services/redisService';
import { getNFTPointsSafe } from '@/data/nftPoints';

interface NFTDisplayProps {
  provider: any; // Cambiado de ethers.providers.Web3Provider a any para compatibilidad
  userAddress: string | null;
  refreshTrigger?: number; // New prop to trigger updates
  onLoadingStateChange?: (isLoading: boolean) => void; // Simplified callback
  miningCompleted?: boolean; // New prop to show mining status
  hasCheckedInToday?: boolean; // Para saber si puede minar
  canMine?: boolean; // Si puede minar
  onMiningSuccess?: () => void; // Callback cuando mina
}

const NFTDisplay: React.FC<NFTDisplayProps> = ({ 
  provider, 
  userAddress, 
  refreshTrigger, 
  onLoadingStateChange, 
  miningCompleted = false,
  hasCheckedInToday = false,
  canMine = false,
  onMiningSuccess
}) => {
  const [nfts, setNfts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncingNFTs, setSyncingNFTs] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [eligiblePoints, setEligiblePoints] = useState<number>(0);
  const [totalBonusPoints, setTotalBonusPoints] = useState<number>(0);
  const [pointsUsedToday, setPointsUsedToday] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(0);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [marketplaceBlockedPoints, setMarketplaceBlockedPoints] = useState<number>(0);
  const [marketplaceBlockedCount, setMarketplaceBlockedCount] = useState<number>(0);
  // Estados para mining
  const [isMining, setIsMining] = useState<boolean>(false);
  const [miningError, setMiningError] = useState<string | null>(null);
  const [miningSuccess, setMiningSuccess] = useState<string | null>(null);
  const [hasMined, setHasMined] = useState<boolean>(false);
  
  // Referencia para la función onLoadingStateChange para evitar dependencias circulares
  const onLoadingStateChangeRef = useRef(onLoadingStateChange);
  
  // Actualizar la referencia cuando cambia la prop
  useEffect(() => {
    onLoadingStateChangeRef.current = onLoadingStateChange;
  }, [onLoadingStateChange]);
  
  useEffect(() => {
    if (!provider || !userAddress) return;
    
    // No cargar NFTs si no ha hecho check-in
    if (!hasCheckedInToday) {
      setNfts([]);
      setLoading(false);
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      // Notify parent component that loading started
      if (onLoadingStateChangeRef.current) onLoadingStateChangeRef.current(true);
      setError(null);
      
      try {
        // PRIMERO: Verificar si ya minó hoy usando la API V2
        const todayDate = new Date().toISOString().split('T')[0];
        const statusResponse = await fetch(`/api/v2/status?wallet_address=${userAddress}`);
        const statusData = await statusResponse.json();
        
        if (statusData.today?.has_mined) {
          console.log('V2: User already mined today');
          setHasMined(true);
        } else {
          setHasMined(false);
        }
        
        // Load NFTs (this includes synchronization with the blockchain)
        setSyncingNFTs(true);
        const result = await fetchUserNFTs(provider, userAddress);
        const { success, nfts: userNfts } = result;
        const nftsError = 'error' in result ? result.error : null;
        setSyncingNFTs(false);
        
        if (!success) {
          if (nftsError && typeof nftsError === 'object' && 'message' in nftsError) {
            throw new Error(String(nftsError.message));
          } else {
            throw new Error('Failed to fetch NFTs');
          }
        }
        
        // Calcular NFT points y obtener los mapas de estado en una sola operación
        // Pasamos false para que no bloquee los NFTs, solo los verifique
        const { totalPoints: eligibleNftPoints, nftStatusMap, lockedNFTsMap, listedNFTsMap } = await calculateNFTPoints(userAddress, false);
        
        // NUEVO: Verificar NFTs bloqueados en la nueva tabla
        let dbBlockedMap: Record<string, boolean> = {};
        if (userNfts && userNfts.length > 0) {
          const tokenIds = userNfts.map(nft => String(nft.tokenId));
          try {
            const blockCheckResponse = await fetch('/api/v2/check-blocked-nfts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token_ids: tokenIds })
            });
            
            if (blockCheckResponse.ok) {
              const blockData = await blockCheckResponse.json();
              dbBlockedMap = blockData.blockedNfts || {};
              console.log(`V2: Checked ${tokenIds.length} NFTs, ${blockData.blockedCount || 0} are blocked in DB`);
            }
          } catch (error) {
            console.error('Error checking NFT blocks:', error);
          }
        }
        
        // Recalcular puntos eligibles considerando los NFTs bloqueados
        let recalculatedPoints = 0;
        
        // Aplicar el estado de bloqueo a los NFTs
        const nftsWithStatus = userNfts ? userNfts.map(nft => {
          const tokenIdStr = String(nft.tokenId);
          
          // V2: Verificar si está bloqueado en la base de datos (más confiable)
          let isUsedToday = false;
          if (statusData.today?.has_mined) {
            // Si ya minó, marcar todos como usados
            isUsedToday = true;
          } else if (dbBlockedMap[tokenIdStr]) {
            // NFT está bloqueado en la nueva tabla
            isUsedToday = true;
          } else {
            // Si no está en DB, verificar Redis como backup
            isUsedToday = lockedNFTsMap && typeof lockedNFTsMap === 'object' ? 
              (lockedNFTsMap as Record<string, boolean>)[tokenIdStr] || false : false;
          }
          
          const isListedInMarketplace = listedNFTsMap && typeof listedNFTsMap === 'object' ? 
            (listedNFTsMap as Record<string, boolean>)[tokenIdStr] || false : false;
          
          // Obtener los puntos correctos del mapa precalculado
          const correctBonusPoints = getNFTPointsSafe(tokenIdStr, nft.bonusPoints || 0);
          
          // Si el NFT no está bloqueado ni listado, sumar sus puntos
          if (!isUsedToday && !isListedInMarketplace) {
            recalculatedPoints += correctBonusPoints;
          }
          
          // Debug específico para NFT #2228
          if (tokenIdStr === '2228') {
            console.log(`🐛 DEBUG NFT #2228 points:`, {
              tokenId: tokenIdStr,
              fromNFTPointsMap: correctBonusPoints,
              fromDatabase: nft.bonusPoints,
              finalUsed: correctBonusPoints
            });
          }
          
          return {
            ...nft,
            bonusPoints: correctBonusPoints, // Usar los puntos correctos
            isUsedToday,
            isListedInMarketplace
          };
        }) : [];
        
        // Actualizar puntos eligibles con el cálculo correcto
        setEligiblePoints(recalculatedPoints);
        
        // Calcular puntos bloqueados por marketplace y usados
        let marketplacePoints = 0;
        let marketplaceCount = 0;
        let usedCount = 0;
        
        nftsWithStatus.forEach(nft => {
          if (nft.isListedInMarketplace) {
            marketplaceCount++;
            marketplacePoints += nft.bonusPoints || 0;
          }
          if (nft.isUsedToday) {
            usedCount++;
          }
        });
        
        setMarketplaceBlockedPoints(marketplacePoints);
        setMarketplaceBlockedCount(marketplaceCount);
        
        // Ya NO usamos usedCount para determinar si minó
        // El estado ya se determinó al principio con la API V2
        console.log(`V2: Mining status already determined: ${hasMined ? 'MINED' : 'NOT MINED'}`);
        console.log(`V2: NFTs marked as used in Redis: ${usedCount}`);
        
        setNfts(nftsWithStatus);
        
        // Eliminada la verificación de parámetros de URL para streak roto
        
        // Load user information using the API instead of direct Supabase access
        const userDataResponse = await fetch(`/api/user-data?wallet_address=${userAddress.toLowerCase()}`);
        const userDataResult = await userDataResponse.json();
        
        if (userDataResult.error) {
          throw new Error(userDataResult.error);
        }
        
        const userData = userDataResult.data;
        
        // Eliminada la verificación de streak roto en los datos del usuario
        
        if (userData) {
          setStreak(userData.current_streak || 0);
          setTotalPoints(userData.total_points || 0);
          
          // Calculate multiplier
          let mult = 1.0;
          if (userData.current_streak >= 29) mult = 3.0;
          else if (userData.current_streak >= 22) mult = 2.5;
          else if (userData.current_streak >= 15) mult = 2.0;
          else if (userData.current_streak >= 8) mult = 1.5;
          
          setMultiplier(mult);
        } else {
          setStreak(0);
          setTotalPoints(0);
          setMultiplier(1.0);
        }
        
        // Ya no necesitamos calcular eligiblePoints aquí, ya lo hicimos arriba
        
        // Now calculate total points from all NFTs regardless of usage
        const { data: allNfts, error: allNftsError } = await supabase
          .from('nfts')
          .select('token_id')
          .eq('wallet_address', userAddress.toLowerCase());
          
        if (allNftsError) throw allNftsError;
        
        // Calculate total using the points map instead of bonus_points column
        const allNftsTotal = allNfts?.reduce((sum, nft) => sum + getNFTPointsSafe(String(nft.token_id), 0), 0) || 0;
        setTotalBonusPoints(allNftsTotal);
        
        // Determine if all points are used today
        setPointsUsedToday(allNftsTotal > 0 && eligibleNftPoints === 0);
        
      } catch (err: any) {
        console.error('Error loading NFT data:', err);
        if (err instanceof Error) {
          setError(err.message || 'An error occurred while loading NFT data');
        } else {
          // Handle cases where err might be an empty object or something else
          console.error('Unexpected error format:', JSON.stringify(err));
          setError('An unknown error occurred while loading NFT data. Check console for details.');
        }
      } finally {
        setLoading(false);
        
        // Notify parent component that loading finished
        if (onLoadingStateChange) {
          onLoadingStateChange(false);
        }
      }
    };
    
    loadData();
  }, [provider, userAddress, refreshTrigger, hasCheckedInToday]); // Added hasCheckedInToday dependency
  
  // No more references or functions for passing data between components
  
  // Mining function - V2
  const handleMining = async () => {
    if (!userAddress || !canMine || hasMined) {
      setMiningError('Cannot mine at this time');
      return;
    }
    
    setIsMining(true);
    setMiningError(null);
    setMiningSuccess(null);
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000); // 20 second timeout
      
      const response = await fetch('/api/v2/mine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: userAddress
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));
      
      const result = await response.json();
      
      if (!response.ok) {
        // Check if already mined
        if (result.alreadyMined) {
          setHasMined(true);
          setMiningError('Already mined today');
        } else if (result.timeout) {
          throw new Error('Mining request timed out. Please try again.');
        } else {
          throw new Error(result.error || 'Failed to send primos to mine');
        }
        return;
      }
      
      // V2 returns different structure
      const pointsEarned = result.miningResult?.finalPoints || 0;
      setMiningSuccess(`Successfully earned ${pointsEarned} points! They are now pending for claim.`);
      setHasMined(true);
      
      // Call callback if provided
      if (onMiningSuccess) {
        onMiningSuccess();
      }
      
      // Clear success message after 5 seconds
      setTimeout(() => setMiningSuccess(null), 5000);
    } catch (err: any) {
      console.error('Mining error:', err);
      setMiningError(err.message || 'Failed to send primos to mine');
      // Clear error after 5 seconds
      setTimeout(() => setMiningError(null), 5000);
    } finally {
      setIsMining(false);
    }
  };
  
  // Calculate potential daily points using eligible points (excluding blocked and marketplace NFTs)
  // Use eligiblePoints which already excludes blocked and marketplace NFTs
  const availableBonusPoints = eligiblePoints;
  const dailyPointsPotential = eligiblePoints * multiplier;
  
  // Function to determine the style for each rarity type
  const getRarityStyle = (rarity: string) => {
    switch(rarity.toLowerCase()) {
      case 'original':
        return 'bg-[#C50045]';
      case 'original z':
        return 'bg-[#EA0354]';
      case 'original z summer':
        return 'bg-gradient-to-r from-[#00BFFF] to-[#FF69B4]'; // Cyan to Pink gradient
      case 'shiny':
        return 'bg-gradient-to-r from-[#00E9FF] via-[#AD4DFF] to-[#FF7CFF]';
      case 'shiny z':
        return 'bg-gradient-to-r from-[#00E9FF] via-[#AD4DFF] via-[#FF7CFF] to-[#FF6265]';
      case 'shiny z summer':
        return 'bg-gradient-to-r from-[#FFD700] via-[#FF8C00] to-[#FF4500]'; // Gold to OrangeRed gradient
      case 'unique':
        return 'bg-gradient-to-r from-[#FFC800] to-[#FF4B4B]';
      default:
        return 'bg-gray-500';
    }
  };
  
  if (!provider || !userAddress) {
    return <div className="p-6 bg-gray-100 rounded-lg">Connect your wallet to view NFTs</div>;
  }
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-md p-6 text-white">
      
      {/* Solo mostrar si hizo check-in */}
      {!hasCheckedInToday ? (
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold mb-4 uppercase">Mining Station</h2>
          <p className="text-gray-400 mb-4">Complete your daily check-in first to send your Primos to mine!</p>
          <div className="bg-gray-700 p-4 rounded-lg">
            <p className="text-sm text-gray-300">After check-in, you can:</p>
            <ul className="list-disc list-inside text-gray-400 mt-2 text-left max-w-md mx-auto">
              <li>Send your Primos NFTs to mine</li>
              <li>Mine based on rarity</li>
              <li>Get streak multiplier bonuses</li>
              <li>Exchange points for Fire Dust tokens</li>
            </ul>
          </div>
        </div>
      ) : (
        <>
      <h2 className="text-2xl font-bold mb-4 uppercase">Mining Station</h2> 
      
      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-4">
          {error}
        </div>
      )}
      
      <div className="flex flex-col gap-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-700 p-4 rounded-md">
            <div className="flex items-start">
              <img 
                src="/images/bonus_primos.png" 
                alt="Primos Bonus" 
                className="h-12 w-12 mr-3" 
              />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-white">Total Primos Bonus</h3>
                <p className="text-2xl font-bold text-white">+{availableBonusPoints}</p>
                    {marketplaceBlockedCount > 0 && (
                  <div className="text-xs text-yellow-400 mt-1">
                    <p>{marketplaceBlockedCount} Primos listed in marketplace.</p>
                    <p>Point reduction: [-{marketplaceBlockedPoints}]</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="bg-gray-700 p-4 rounded-md">
            <div className="flex items-start">
              <img 
                src="/images/bous_multiplier.png" 
                alt="Multiplier Bonus" 
                className="h-12 w-12 mr-3" 
              />
              <div>
                <h3 className="font-bold text-lg text-white">Streak Multiplier Bonus</h3>
                <p className="text-2xl font-bold text-white">x{multiplier}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mining Button - Solo mostrar si hizo check-in */}
        {hasCheckedInToday && (
          <div className="mt-4">
            {!hasMined ? (
              <button
                onClick={handleMining}
                disabled={!canMine || isMining || availableBonusPoints === 0}
                className={`w-full px-6 py-3 rounded-lg font-bold text-lg transition-all duration-300 ${
                  isMining ? 'bg-yellow-700 text-white cursor-wait' :
                  !canMine || availableBonusPoints === 0 ? 'bg-gray-600 text-gray-300 cursor-not-allowed' :
                  'bg-yellow-600 text-white hover:bg-yellow-700'
                }`}
              >
                {isMining ? 'Sending primos to mine...' :
                 availableBonusPoints === 0 ? 'No Primos Available' :
                 !canMine ? 'Cannot Mine' :
                 'Send Primos to Mine'}
              </button>
            ) : (
              <div className="bg-green-800 text-green-100 p-3 rounded-lg text-center">
                ✅ Already Mined Today
              </div>
            )}
            
            {/* Error message */}
            {miningError && (
              <div className="mt-2 p-3 bg-red-100 text-red-700 rounded-md">
                {miningError}
              </div>
            )}
            
            {/* Success message */}
            {miningSuccess && (
              <div className="mt-2 p-3 bg-green-100 text-green-700 rounded-md">
                {miningSuccess}
              </div>
            )}
          </div>
        )}
      </div>
      
<h3 className="text-xl font-bold mt-6 mb-4 uppercase">Your Primos</h3>
      
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : nfts.length === 0 ? (
        <div 
          className="text-center py-12 rounded-md flex items-center justify-center mb-8" 
          style={{
            backgroundImage: 'url(/images/primo_estatua.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '200px',
            filter: 'grayscale(100%)'
          }}
        >
          <p className="font-bold text-white text-lg bg-black bg-opacity-50 px-4 py-2 rounded">No Primos found in your wallet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {nfts.map((nft, index) => (
            <div
              key={index}
              className="bg-gray-700 p-3 rounded-lg border border-gray-600 flex items-center gap-3"
            >
              {/* Imagen pequeña a la izquierda */}
              <div className="relative w-16 h-16 flex-shrink-0">
                {nft.metadata?.image && (
                  <>
                    <img 
                      src={nft.metadata.image} 
                      alt={nft.metadata.name || `NFT #${nft.tokenId}`}
                      className={`w-full h-full object-cover rounded ${
                        nft.isUsedToday || nft.isListedInMarketplace ? 'opacity-50' : ''
                      }`}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder-nft.png';
                      }}
                    />
                    {nft.isListedInMarketplace && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-yellow-500 text-white px-1 py-0.5 rounded text-xs font-bold">
                          Listed
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
              
              {/* Info a la derecha */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm text-white truncate">
                    {nft.metadata?.name || `NFT #${nft.tokenId}`}
                  </h4>
                  {/* Status dot */}
                  {nft.isListedInMarketplace ? (
                    <div className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0" title="Listed in Marketplace - Cannot mine"></div>
                  ) : nft.isUsedToday ? (
                    <div className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0" title="Already mined today - Available tomorrow"></div>
                  ) : (
                    <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" title="Available for mining"></div>
                  )}
                </div>
                <p className="text-xs text-gray-300">Bonus: +{nft.bonusPoints}</p>
                {nft.isListedInMarketplace && (
                  <p className="text-xs text-yellow-400 mt-1">Listed in Marketplace</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  {nft.rarity && (
                    <span className={`inline-block px-1 py-0 text-white text-[10px] font-bold rounded uppercase ${getRarityStyle(nft.rarity)}`}>
                      {nft.rarity}
                    </span>
                  )}
                  {nft.isFullSet && (
                    <span className="inline-block px-1 py-0 bg-[#36B57C] text-white text-[10px] font-bold rounded uppercase">
                      Full Set
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default NFTDisplay;
