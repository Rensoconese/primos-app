import { createPublicClient, createWalletClient, http, custom, fallback, type PublicClient, type WalletClient } from 'viem';
import { ronin, roninSaigon } from './chain';

/**
 * Direcciones de contrato para diferentes redes
 */
export const CONTRACT_ADDRESSES = {
  // Original Saigon testnet contract
  TESTNET: '0x12ad694088243628f4038c1fab32ff89c2f986f2',
  // New mainnet contract
  MAINNET: '0x215d0d82dbd0ca2bb0b6c4e68a5166ddddd5560b'
};

/**
 * Función para obtener la dirección de contrato adecuada según el ID de cadena
 * @param chainId ID de la cadena (opcional)
 * @returns Dirección del contrato
 */
export const getContractAddress = (chainId?: number): string => {
  // Default to testnet if no chainId is provided
  if (!chainId) {
    console.log('No chainId provided, defaulting to testnet contract');
    return CONTRACT_ADDRESSES.TESTNET;
  }

  switch (chainId) {
    case ronin.id:
      console.log('Using mainnet contract address');
      return CONTRACT_ADDRESSES.MAINNET;
    case roninSaigon.id:
      console.log('Using testnet contract address');
      return CONTRACT_ADDRESSES.TESTNET;
    default:
      console.log(`Unknown chainId ${chainId}, defaulting to testnet contract`);
      return CONTRACT_ADDRESSES.TESTNET;
  }
};

/**
 * Crear un cliente público con fallback para múltiples RPC
 * @returns Cliente público de viem
 */
export const createPublicClientWithFallback = async (): Promise<PublicClient> => {
  const primaryRpcUrl = process.env.RONIN_RPC_URL || 'https://api.roninchain.com/rpc';
  const backupRpcUrl = process.env.RONIN_RPC_URL_BACKUP;
  const moralisApiKey = process.env.MORALIS_API_KEY;

  // Configuración de headers para evitar problemas de referrer
  const headers = {
    'Referrer-Policy': 'no-referrer',
    'User-Agent': 'RoninWallet/1.0.0'
  } as Record<string, string>;

  // Añadir API key si está disponible
  if (moralisApiKey) {
    headers['x-api-key'] = moralisApiKey;
  }

  // Crear array de transportes para fallback
  const transports = [http(primaryRpcUrl, { 
    fetchOptions: { 
      headers: headers 
    } 
  })];

  // Añadir transporte de backup si está disponible
  if (backupRpcUrl) {
    transports.push(http(backupRpcUrl, { 
      fetchOptions: { 
        headers: headers 
      } 
    }));
  }

  // Añadir RPC público como último recurso
  transports.push(http('https://api.roninchain.com/rpc', { 
    fetchOptions: { 
      headers: headers 
    } 
  }));

  // Crear cliente público con fallback
  return createPublicClient({
    chain: ronin,
    transport: fallback(transports)
  });
};

/**
 * Función de utilidad para reintentar una operación con backoff exponencial
 * @param operation Función a reintentar
 * @param maxRetries Número máximo de reintentos
 * @param initialDelay Retraso inicial en ms
 * @returns Resultado de la operación
 */
export const retry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 500
): Promise<T> => {
  let lastError: any;
  let delay = initialDelay;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      lastError = error;
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Exponential backoff
      delay *= 2;
    }
  }
  
  throw lastError;
};
