'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { 
  createPublicClient, 
  createWalletClient,
  custom, 
  type PublicClient,
  type WalletClient,
  type Address,
  getContract
} from 'viem';
import { ronin } from '@/utils/chain';
import { FIRE_DUST_ABI } from '@/utils/token-abi';

// Dirección del token ERC1155 Fire Dust
const FIRE_DUST_ADDRESS = '0xE3a334D6b7681D0151b81964CAf6353905e24B1b';
// ID del token dentro del contrato ERC1155
const FIRE_DUST_ID = 4; // ID correcto según metadatos del token Fire Dust

interface RewardsPanelProps {
  userAddress: string | null;
  totalPoints: number; // Mantenemos para compatibilidad pero usaremos pending claims
  onRewardClaimed: () => void;
  provider: any; // Cambiado de ethers.providers.Web3Provider a any para compatibilidad
  refreshTrigger: number; // Prop para triggear refresh cuando cambia (no optional)
}

interface PendingClaim {
  id: string;
  wallet_address: string;
  daily_id: string;
  points_to_claim: number;
  status: string;
  created_at: string;
  expire_at: string;
}

const RewardsPanel: React.FC<RewardsPanelProps> = ({ 
  userAddress, 
  totalPoints,
  onRewardClaimed,
  provider,
  refreshTrigger
}) => {
  // Estado local
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([]);
  const [pendingPoints, setPendingPoints] = useState<number>(0);
  const [loadingClaims, setLoadingClaims] = useState<boolean>(true);
  const [processingClaims, setProcessingClaims] = useState<Set<string>>(new Set());
  
  // Cargar balance de token Fire Dust y pending claims
  useEffect(() => {
    if (!userAddress || !provider) return;
    
    const fetchData = async () => {
      try {
        // Fetch token balance
        const publicClient = provider.publicClient || createPublicClient({
          chain: ronin,
          transport: custom(provider.provider || provider)
        });
        
        const balance = await publicClient.readContract({
          address: FIRE_DUST_ADDRESS as Address,
          abi: FIRE_DUST_ABI,
          functionName: 'balanceOf',
          args: [userAddress as Address, BigInt(FIRE_DUST_ID)]
        });
        
        setTokenBalance(balance.toString());
        
        // Fetch pending claims from v2
        setLoadingClaims(true);
        const claimsResponse = await fetch(`/api/v2/claim?wallet_address=${userAddress}&status=pending`);
        const claimsData = await claimsResponse.json();
        
        if (claimsResponse.ok) {
          setPendingClaims(claimsData.claims || []);
          setPendingPoints(claimsData.summary?.totalPoints || 0);
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
      } finally {
        setLoadingClaims(false);
      }
    };
    
    fetchData();
  }, [userAddress, provider, refreshTrigger]); // Added refreshTrigger dependency
  
  // Manejar claim individual
  const handleClaimIndividual = async (claimId: string) => {
    if (!userAddress) {
      setError('Please connect your wallet');
      return;
    }
    
    // Marcar como procesando (UI optimista)
    setProcessingClaims(prev => new Set(prev).add(claimId));
    setError(null);
    
    try {
      console.log(`Claiming individual reward: ${claimId}`);
      
      // Llamar al endpoint v2 con el claim específico
      const response = await fetch('/api/v2/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: userAddress,
          claim_ids: [claimId], // Claim individual
          claim_all: false
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim reward');
      }
      
      const pointsClaimed = data.claimResult?.pointsClaimed || 0;
      const txHash = data.claimResult?.txHash;
      
      // Actualizar el balance local
      const newTokenBalance = (parseInt(tokenBalance) + pointsClaimed).toString();
      setTokenBalance(newTokenBalance);
      
      // Remover el claim de la lista
      setPendingClaims(prev => prev.filter(c => c.id !== claimId));
      setPendingPoints(prev => prev - pointsClaimed);
      
      // Mostrar notificación de éxito
      const successMsg = `✅ Successfully claimed ${pointsClaimed} Fire Dust!${txHash ? ` TX: ${txHash.slice(0, 10)}...` : ''}`;
      setSuccess(successMsg);
      
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setSuccess(null), 5000);
      
      // Notificar al componente padre
      onRewardClaimed();
      
    } catch (err: any) {
      console.error('Error claiming individual reward:', err);
      setError(err.message || 'Failed to claim reward');
      
      // Mostrar error por 5 segundos y luego limpiar
      setTimeout(() => setError(null), 5000);
    } finally {
      // Quitar del set de procesando
      setProcessingClaims(prev => {
        const newSet = new Set(prev);
        newSet.delete(claimId);
        return newSet;
      });
    }
  };
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-md p-6 text-white">
      <h2 className="text-2xl font-bold mb-4 uppercase">Fire dust rewards</h2>
      
      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 text-green-700 p-3 rounded-md mb-4 animate-pulse">
          {success}
        </div>
      )}
      
      <div className="bg-gray-700 p-4 rounded-md">
        {/* Fire Dust header con video/imagen */}
        {pendingPoints <= 0 ? (
          <div className="mb-4">
            <img 
              src="/images/firedust-byn.png" 
              alt="No rewards available" 
              className="w-full rounded-md"
            />
          </div>
        ) : (
          <div className="mb-4">
            <video 
              src="/videos/fire-dust.webm" 
              autoPlay
              loop
              muted
              className="w-full rounded-md"
            />
          </div>
        )}
        
        {/* Lista de claims individuales */}
        {loadingClaims ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="text-sm text-gray-400 mt-2">Loading claims...</p>
          </div>
        ) : pendingClaims.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No pending claims</p>
            <p className="text-sm text-gray-500 mt-1">Send your Primos to mine and earn Fire Dust</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {pendingClaims.map((claim, index) => (
              <div
                key={claim.id}
                className="bg-gray-600/50 p-3 rounded-lg border border-gray-500/20 flex items-center gap-3"
              >
                {/* Imagen de Fire Dust */}
                <div className="relative w-12 h-12 flex-shrink-0">
                  <img 
                    src="/images/fire-dust.png"
                    alt="Fire Dust"
                    className="w-full h-full object-contain"
                  />
                </div>
                
                {/* Nombre y cantidad */}
                <div className="flex-1">
                  <div className="font-semibold text-white">
                    Fire Dust
                  </div>
                  <div className="text-xl font-bold text-white">
                    {claim.points_to_claim}
                  </div>
                </div>
                
                {/* Botón de Claim */}
                <button
                  onClick={() => handleClaimIndividual(claim.id)}
                  disabled={processingClaims.has(claim.id)}
                  className={`px-4 py-2 font-semibold rounded-md transition-colors text-sm ${
                    processingClaims.has(claim.id)
                      ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {processingClaims.has(claim.id) ? 'Processing...' : 'Claim'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RewardsPanel;
