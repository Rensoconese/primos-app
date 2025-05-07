import { createPublicClient, createWalletClient, http, custom, fallback, type PublicClient, type WalletClient } from 'viem';
import { ronin, roninSaigon } from './chain';
import { ethers } from 'ethers';
import { CheckIn__factory, CheckInContract } from './contract-types';

/**
 * Direcciones de contrato para diferentes redes
 */
export const CONTRACT_ADDRESSES = {
  // Original Saigon testnet contract
  TESTNET: '0x12ad694088243628f4038c1fab32ff89c2f986f2',
  // New mainnet contract
  MAINNET: '0x215d0d82dbd0ca2bb0b6c4e68a5166ddddd5560b'
};

// Network IDs for Ronin (para compatibilidad con código antiguo)
export const RONIN_CHAIN_IDS = {
  MAINNET: 2020,
  TESTNET: 2021 // Saigon testnet
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

// Known function selectors for direct low-level calls (para compatibilidad con código antiguo)
export const FUNCTION_SELECTORS = {
  owner: '0x8da5cb5b', // owner()
  checkIn: '0xd9a59e33', // checkIn(address)
  isCheckedInToday: '0x395ffd55', // isCheckedInToday(address)
  getLastUpdatedPeriod: '0x5e98a4da', // getLastUpdatedPeriod(address)
  getCurrentStreak: '0xccbac9f5', // getCurrentStreak(address)
};

// Create a contract instance with custom error handling (para compatibilidad con código antiguo)
export const getContract = async (provider: ethers.providers.Web3Provider): Promise<CheckInContract> => {
  if (!provider) {
    console.error('Provider is null or undefined');
    throw new Error('Provider is not available');
  }
  
  try {
    let accounts: string[] = [];
    
    try {
      accounts = await provider.listAccounts();
      
      if (!accounts || accounts.length === 0) {
        console.warn('No accounts available in provider, but continuing with limited functionality');
      } else {
        console.log('Found accounts:', accounts);
      }
    } catch (accountsError) {
      console.warn('Error listing accounts, but continuing with limited functionality:', accountsError);
    }
    
    // Get current network information
    const network = await provider.getNetwork();
    console.log(`Connected to network with chainId: ${network.chainId}`);
    
    // Get the contract address based on chainId
    const contractAddress = getContractAddress(network.chainId);
    
    if (!contractAddress || contractAddress.match(/^0x0+$/)) {
      console.error('Invalid contract address');
      throw new Error('Contract address is not properly configured');
    }
    
    console.log(`Using contract address: ${contractAddress}`);
    
    // Intentar obtener el signer de manera segura
    let signer;
    try {
      signer = provider.getSigner();
      console.log('Got signer successfully');
    } catch (signerError) {
      console.error('Error getting signer:', signerError);
      throw new Error('Failed to get wallet signer. Please reconnect your wallet.');
    }
    
    // Create the contract using the factory pattern
    const contract = CheckIn__factory.connect(contractAddress, signer);
    
    return contract;
  } catch (error) {
    console.error('Error creating contract instance:', error);
    throw error;
  }
};

// Safe BigNumber conversion helper (para compatibilidad con código antiguo)
export const safeNumberFromBN = (bn: ethers.BigNumber, defaultValue: number = 0): number => {
  try {
    return bn.toNumber();
  } catch (error) {
    console.error('Error converting BigNumber to number, possibly too large:', error);
    if (error instanceof Error && error.message.includes('overflow')) {
      console.log('BigNumber value (string):', bn.toString());
    }
    return defaultValue;
  }
};

// Safe string conversion helper (para compatibilidad con código antiguo)
export const safeStringFromBN = (bn: ethers.BigNumber, defaultValue: string = '0'): string => {
  try {
    return bn.toString();
  } catch (error) {
    console.error('Error converting BigNumber to string:', error);
    return defaultValue;
  }
};

// Encode a function call with an address parameter (para compatibilidad con código antiguo)
const encodeAddressParam = (selector: string, address: string): string => {
  // Convert address to padded parameter (32 bytes)
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, '0');
  return `${selector}000000000000000000000000${paddedAddress}`;
};

// Perform a direct contract call with retries and fallbacks (para compatibilidad con código antiguo)
export const directContractCall = async <T>(
  provider: ethers.providers.Web3Provider,
  method: string, 
  params: string = '', // Encoded parameters (if any)
  parser: (result: string) => T,
  defaultValue: T
): Promise<T> => {
  const selector = FUNCTION_SELECTORS[method as keyof typeof FUNCTION_SELECTORS];
  if (!selector) {
    console.error(`Unknown function selector for method: ${method}`);
    return defaultValue;
  }
  
  try {
    // Get network information to determine which contract to use
    const network = await provider.getNetwork();
    const contractAddress = getContractAddress(network.chainId);
    
    // Try up to 3 times with increasing delays
    const result = await retry(async () => {
      return await provider.call({
        to: contractAddress,
        data: `${selector}${params}`
      });
    }, 3, 500);
    
    if (result) {
      return parser(result);
    }
  } catch (error) {
    console.error(`Direct contract call to ${method} failed:`, error);
  }
  
  return defaultValue;
};
