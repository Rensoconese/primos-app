import { ethers } from 'ethers';
import { CheckIn__factory, CheckInContract } from './contract-types';

// Contract addresses for different networks
export const CONTRACT_ADDRESSES = {
  // Original Saigon testnet contract
  TESTNET: '0x12ad694088243628f4038c1fab32ff89c2f986f2',
  // New mainnet contract
  MAINNET: '0x215d0d82dbd0ca2bb0b6c4e68a5166ddddd5560b'
};

// Network IDs for Ronin
export const RONIN_CHAIN_IDS = {
  MAINNET: 2020,
  TESTNET: 2021 // Saigon testnet
};

// Function to get the appropriate contract address based on chain ID
export const getContractAddress = async (chainId?: number): Promise<string> => {
  // Default to testnet if no chainId is provided
  if (!chainId) {
    console.log('No chainId provided, defaulting to testnet contract');
    return CONTRACT_ADDRESSES.TESTNET;
  }

  switch (chainId) {
    case RONIN_CHAIN_IDS.MAINNET:
      console.log('Using mainnet contract address');
      return CONTRACT_ADDRESSES.MAINNET;
    case RONIN_CHAIN_IDS.TESTNET:
      console.log('Using testnet contract address');
      return CONTRACT_ADDRESSES.TESTNET;
    default:
      console.log(`Unknown chainId ${chainId}, defaulting to testnet contract`);
      return CONTRACT_ADDRESSES.TESTNET;
  }
};

// Known function selectors for direct low-level calls in case normal methods fail
// These are the first 4 bytes of the keccak256 hash of the function signature
export const FUNCTION_SELECTORS = {
  owner: '0x8da5cb5b', // owner()
  checkIn: '0xd9a59e33', // checkIn(address)
  isCheckedInToday: '0x395ffd55', // isCheckedInToday(address)
  getLastUpdatedPeriod: '0x5e98a4da', // getLastUpdatedPeriod(address)
  getCurrentStreak: '0xccbac9f5', // getCurrentStreak(address)
};

// Helper function to retry a function with exponential backoff
export const retry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 500
): Promise<T> => {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
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

// Encode a function call with an address parameter
const encodeAddressParam = (selector: string, address: string): string => {
  // Convert address to padded parameter (32 bytes)
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, '0');
  return `${selector}000000000000000000000000${paddedAddress}`;
};

// Create a contract instance with custom error handling and low-level fallbacks
export const getContract = async (provider: ethers.providers.Web3Provider): Promise<CheckInContract> => {
  if (!provider) {
    console.error('Provider is null or undefined');
    throw new Error('Provider is not available');
  }
  
  try {
    let accounts: string[] = [];
    
    try {
      // Obtener cuentas dentro de un try/catch para no interrumpir todo el flujo
      accounts = await provider.listAccounts();
      
      if (!accounts || accounts.length === 0) {
        console.warn('No accounts available in provider, but continuing with limited functionality');
        // No lanzamos error aquí, permitimos continuar con funcionalidad limitada
      } else {
        console.log('Found accounts:', accounts);
      }
    } catch (accountsError) {
      console.warn('Error listing accounts, but continuing with limited functionality:', accountsError);
      // No lanzamos error aquí tampoco, permitimos continuar con funcionalidad limitada
    }
    
    // Get current network information
    const network = await provider.getNetwork();
    console.log(`Connected to network with chainId: ${network.chainId}`);
    
    // Get the contract address based on chainId
    const contractAddress = await getContractAddress(network.chainId);
    
    if (!contractAddress || contractAddress.match(/^0x0+$/)) {
      console.error('Invalid contract address');
      throw new Error('Contract address is not properly configured');
    }
    
    console.log(`Using contract address: ${contractAddress}`);
    
    // Intentar obtener el signer de manera segura - este es un punto crítico
    let signer;
    try {
      // Es posible que no tengamos cuentas, así que usamos getSigner() sin parámetros
      // que es más confiable en este caso
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

// Safe BigNumber conversion helper - handles numeric overflow errors
export const safeNumberFromBN = (bn: ethers.BigNumber, defaultValue: number = 0): number => {
  try {
    return bn.toNumber();
  } catch (error) {
    console.error('Error converting BigNumber to number, possibly too large:', error);
    if (error instanceof Error && error.message.includes('overflow')) {
      // For display purposes, we can use a formatted string representation instead
      console.log('BigNumber value (string):', bn.toString());
    }
    return defaultValue;
  }
};

// Safe string conversion helper - handles formatting of large numbers
export const safeStringFromBN = (bn: ethers.BigNumber, defaultValue: string = '0'): string => {
  try {
    return bn.toString();
  } catch (error) {
    console.error('Error converting BigNumber to string:', error);
    return defaultValue;
  }
};

// Perform a direct contract call with retries and fallbacks
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
    const contractAddress = await getContractAddress(network.chainId);
    
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
