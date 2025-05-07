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
  totalPoints: number;
  onRewardClaimed: () => void;
  provider: any; // Cambiado de ethers.providers.Web3Provider a any para compatibilidad
}

const RewardsPanel: React.FC<RewardsPanelProps> = ({ 
  userAddress, 
  totalPoints,
  onRewardClaimed,
  provider
}) => {
  // Estado local
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{
    title: string;
    suggestions: string[];
  } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  
  // Cargar balance de token Fire Dust
  useEffect(() => {
    if (!userAddress || !provider) return;
    
    const fetchTokenBalance = async () => {
      try {
        // Usar el publicClient directamente si está disponible, o crearlo si no
        const publicClient = provider.publicClient || createPublicClient({
          chain: ronin,
          transport: custom(provider.provider || provider)
        });
        
        // Crear instancia del contrato ERC1155 usando viem
        const fireDustContract = getContract({
          address: FIRE_DUST_ADDRESS as Address,
          abi: FIRE_DUST_ABI,
          client: publicClient
        });
        
        // Obtener balance del token con ID específico
        const balance = await publicClient.readContract({
          address: FIRE_DUST_ADDRESS as Address,
          abi: FIRE_DUST_ABI,
          functionName: 'balanceOf',
          args: [userAddress as Address, BigInt(FIRE_DUST_ID)]
        });
        
        setTokenBalance(balance.toString());
      } catch (err: any) {
        console.error('Error fetching token balance:', err);
      }
    };
    
    fetchTokenBalance();
  }, [userAddress, provider]);
  
  // La actualización del leaderboard ahora se realiza en el endpoint /api/claim-tokens
  
  // Función para realizar peticiones con reintento y manejo de errores de red
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt + 1} to call API ${url}`);
        const response = await fetch(url, options);
        return response;
      } catch (err: any) {
        console.error(`Attempt ${attempt + 1} failed:`, err.message);
        lastError = err;
        
        // Si no es el último intento, esperar antes de reintentar (backoff exponencial)
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Si llegamos aquí, todos los intentos fallaron
    throw lastError || new Error('All fetch attempts failed');
  };
  
  // Manejar la solicitud de recompensa
  const handleClaimRewards = async () => {
    if (!userAddress || totalPoints <= 0) {
      setError('No points available to claim');
      return;
    }
    
    // Verificar que la wallet esté correctamente conectada
    if (!provider) {
      setError('Wallet provider not available. Please reconnect your wallet.');
      return;
    }
    
    // Verificar que podamos acceder a la wallet usando viem
    try {
      // Usar el publicClient y walletClient directamente si están disponibles, o crearlos si no
      const publicClient = provider.publicClient || createPublicClient({
        chain: ronin,
        transport: custom(provider.provider || provider)
      });
      
      // Usar el walletClient directamente si está disponible, o crearlo si no
      const walletClient = provider.walletClient || createWalletClient({
        chain: ronin,
        transport: custom(provider.provider || provider)
      });
      
      // Obtener cuentas
      const accounts = await walletClient.getAddresses();
      if (accounts.length === 0) {
        setError('No accounts found in wallet. Please reconnect your wallet.');
        return;
      }
      
      // Verificar que estamos en la red correcta
      const chainId = publicClient.chain.id;
      if (![2020, 2021].includes(chainId)) {
        setError(`You are connected to an unsupported network (Chain ID: ${chainId}). Please switch to Ronin Mainnet or Testnet.`);
        return;
      }
    } catch (err) {
      console.error('Error checking wallet connection:', err);
      setError('Error verifying wallet connection. Please reconnect your wallet.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setErrorInfo(null);
    setSuccess(null);
    
    // Función para clasificar y formatear errores
    const handleApiError = (error: any) => {
      console.error('Detailed error information:', error);
      
      // Extraer información del error
      const errorMessage = error.message || 'Unknown error';
      const isNetworkError = errorMessage.includes('Network error') || 
                            errorMessage.includes('NETWORK_ERROR');
      
      if (isNetworkError) {
        setErrorInfo({
          title: 'Network Connection Error',
          suggestions: [
            'Verify your internet connection',
            'Check if Ronin network is operational',
            'Make sure your Ronin wallet is unlocked and connected',
            'Try refreshing the page'
          ]
        });
        return `Network Error: Could not connect to the Ronin network`;
      }
      
      if (errorMessage.includes('Transaction processing delayed') || 
          errorMessage.includes('Procesamiento de transacción retrasado')) {
        setErrorInfo({
          title: 'Transaction Delayed',
          suggestions: [
            'Your request has been registered',
            'Tokens will be sent to your wallet soon',
            'You can check back later'
          ]
        });
        return errorMessage;
      }
      
      if (errorMessage.includes('Approval error')) {
        setErrorInfo({
          title: 'Token Approval Error',
          suggestions: [
            'The reward pool may need approval to transfer tokens',
            'Try again later when this has been resolved'
          ]
        });
        return errorMessage;
      }
      
      // Mensaje genérico para otros errores
      setErrorInfo({
        title: 'Error Processing Request',
        suggestions: [
          'Try again later',
          'Ensure your wallet is properly connected',
          'Contact support if the issue persists'
        ]
      });
      
      return errorMessage;
    };

    try {
      // Intentar primero con el nuevo endpoint simplificado
      console.log('Calling simplified claim tokens API...');
      const response = await fetch('/api/claim-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: userAddress,
          amount: totalPoints,
        }),
      });
      
      const data = await response.json();
      console.log('API Response:', data);
      
      if (!response.ok) {
        const errorMessage = data.error || 'Failed to claim rewards';
        const errorDetails = data.details || '';
        const errorCode = data.code || '';
        
        // Mensaje de error más detallado
        let fullErrorMessage = `${errorMessage}${errorDetails ? ': ' + errorDetails : ''}`;
        if (errorCode) {
          fullErrorMessage += ` (Code: ${errorCode})`;
        }
        
        // Registrar el error completo en la consola
        console.error('API Error Response:', data);
        
        throw new Error(fullErrorMessage);
      }
      
      // La actualización del leaderboard ya se realiza en el endpoint claim-tokens,
      // elimino la actualización duplicada desde aquí para evitar contar doble los tokens
      
      // Actualizar el balance local de tokens
      const newTokenBalance = (parseInt(tokenBalance) + totalPoints).toString();
      setTokenBalance(newTokenBalance);
      
      // Mostrar mensaje de éxito
      setSuccess(`Successfully claimed ${totalPoints} Fire Dust tokens!`);
      
      // Actualizar la UI del componente padre sin recargar NFTDisplay
      console.log("Llamando a onRewardClaimed (actualización específica para recompensas)");
      onRewardClaimed();
    } catch (err: any) {
      console.error('Error claiming rewards:', err);
      const formattedError = handleApiError(err);
      setError(formattedError || 'An error occurred while claiming rewards');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-md p-6 text-white">
      <h2 className="text-2xl font-bold mb-4 uppercase">Fire dust rewards</h2>
      
      
      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-4">
          {errorInfo && (
            <>
              <h3 className="font-bold">{errorInfo.title}</h3>
              <p className="mb-2">{error}</p>
              {errorInfo.suggestions.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-sm">Suggestions:</p>
                  <ul className="list-disc pl-5 mt-1">
                    {errorInfo.suggestions.map((suggestion, index) => (
                      <li key={index} className="text-sm">{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {!errorInfo && error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 text-green-700 p-4 rounded-md mb-4">
          {success}
        </div>
      )}
      
      <div className="">
        <div className="bg-gray-700 p-4 rounded-md">
        {totalPoints <= 0 ? (
          <div className="mt-4">
            <img 
              src="/images/firedust-byn.png" 
              alt="No rewards available" 
              className="w-full rounded-md"
            />
          </div>
        ) : (
          <div className="mt-4">
            <video 
              src="/videos/fire-dust.webm" 
              
              autoPlay
              loop
              muted
              className="w-full rounded-md"
            />
          </div>
        )}
          <p className="text-2xl font-bold"> Total: {totalPoints === 0 ? '0' : totalPoints.toFixed(2)}</p>
          
        </div>
        
        
      </div>
      
      <div className=" pt-4">
      <div className="mb-4">
          <p className="text-sm text-gray-400">
            You will claim all your available Fire Dust.
          </p>
        </div>
        <button
          onClick={handleClaimRewards}
          disabled={loading || totalPoints <= 0 || !userAddress}
          className={`w-full px-6 py-3 rounded-md font-medium ${
            loading || totalPoints <= 0 || !userAddress
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
          title="Claim your rewards at any time!"
        >
          {loading ? 'Processing...' : 'Claim'}
        </button>
      </div>
    </div>
  );
};

export default RewardsPanel;
