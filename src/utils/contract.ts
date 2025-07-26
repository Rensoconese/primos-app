import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  custom, 
  fallback, 
  type PublicClient, 
  type WalletClient,
  type Address,
  getContract as viemGetContract,
  parseEther,
  formatEther,
  toHex
} from 'viem';
import { ronin, roninSaigon } from './chain';
import { 
  CHECK_IN_ABI, 
  getCheckInContract, 
  readCheckInContract, 
  writeCheckInContract,
  type CheckInContract 
} from './contract-types';

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

// Create a contract instance with custom error handling
export const getViemContract = async (
  client: PublicClient | WalletClient,
  account?: Address
): Promise<CheckInContract> => {
  if (!client) {
    console.error('Client is null or undefined');
    throw new Error('Client is not available');
  }
  
  try {
    // Get current chain information
    const chainId = client.chain?.id;
    console.log(`Connected to network with chainId: ${chainId}`);
    
    // Get the contract address based on chainId
    const contractAddress = getContractAddress(chainId) as Address;
    
    if (!contractAddress || contractAddress.match(/^0x0+$/)) {
      console.error('Invalid contract address');
      throw new Error('Contract address is not properly configured');
    }
    
    console.log(`Using contract address: ${contractAddress}`);
    
    // Create the contract using viem
    const contract = viemGetContract({
      address: contractAddress,
      abi: CHECK_IN_ABI,
      client
    });
    
    return contract as CheckInContract;
  } catch (error) {
    console.error('Error creating contract instance:', error);
    throw error;
  }
};

// Compatibility function for ethers-style contract access
export const getContract = async (provider: any): Promise<any> => {
  console.warn('Using legacy getContract function. Consider migrating to getViemContract.');
  
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
    
    // Create a compatibility wrapper for viem contract
    const walletClient = createWalletClient({
      chain: ronin,
      transport: custom(provider.provider)
    });
    
    const publicClient = createPublicClient({
      chain: ronin,
      transport: http()
    });
    
    const viemContract = await getViemContract(publicClient);
    
    // Create a compatibility wrapper that mimics the ethers contract interface
    return {
      // View functions
      owner: async () => {
        return readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'owner'
        });
      },
      MAX_QUERY_LIMIT: async () => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'MAX_QUERY_LIMIT'
        });
        return { toNumber: () => Number(result) };
      },
      PERIOD_DURATION: async () => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'PERIOD_DURATION'
        });
        return { toNumber: () => Number(result) };
      },
      limitDailyCheckIn: async () => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'limitDailyCheckIn'
        });
        return { toNumber: () => Number(result) };
      },
      periodEndAt: async () => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'periodEndAt'
        });
        return { toNumber: () => Number(result) };
      },
      
      // User-related view functions
      isCheckedInToday: async (user: string) => {
        return readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'isCheckedInToday',
          args: [user as Address]
        });
      },
      isMissedCheckIn: async (user: string) => {
        return readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'isMissedCheckIn',
          args: [user as Address]
        });
      },
      getCurrentStreak: async (user: string) => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'getCurrentStreak',
          args: [user as Address]
        });
        return { toNumber: () => Number(result) };
      },
      getLastUpdatedPeriod: async (user: string) => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'getLastUpdatedPeriod',
          args: [user as Address]
        });
        return { toNumber: () => Number(result) };
      },
      getStreakAtPeriod: async (user: string, period: number) => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'getStreakAtPeriod',
          args: [user as Address, BigInt(period)]
        });
        return { toNumber: () => Number(result) };
      },
      computePeriod: async (timestamp: number) => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'computePeriod',
          args: [BigInt(timestamp)]
        });
        return { toNumber: () => Number(result) };
      },
      
      // Transaction functions
      checkIn: async (to: string) => {
        const account = await signer.getAddress();
        const hash = await writeCheckInContract(walletClient, {
          address: contractAddress as Address,
          functionName: 'checkIn',
          args: [to as Address],
          account: account as Address,
          chain: ronin
        });
        
        // Create a transaction-like object for compatibility
        return {
          hash,
          wait: async () => {
            return publicClient.waitForTransactionReceipt({ hash });
          }
        };
      },
      initialize: async (owner: string, _limitDailyCheckIn: number, _periodEndAt: number) => {
        const account = await signer.getAddress();
        const hash = await writeCheckInContract(walletClient, {
          address: contractAddress as Address,
          functionName: 'initialize',
          args: [owner as Address, BigInt(_limitDailyCheckIn), BigInt(_periodEndAt)],
          account: account as Address,
          chain: ronin
        });
        
        return {
          hash,
          wait: async () => {
            return publicClient.waitForTransactionReceipt({ hash });
          }
        };
      },
      renounceOwnership: async () => {
        const account = await signer.getAddress();
        const hash = await writeCheckInContract(walletClient, {
          address: contractAddress as Address,
          functionName: 'renounceOwnership',
          account: account as Address,
          chain: ronin
        });
        
        return {
          hash,
          wait: async () => {
            return publicClient.waitForTransactionReceipt({ hash });
          }
        };
      },
      setLimitDailyCheckIn: async (_limitDailyCheckIn: number) => {
        const account = await signer.getAddress();
        const hash = await writeCheckInContract(walletClient, {
          address: contractAddress as Address,
          functionName: 'setLimitDailyCheckIn',
          args: [BigInt(_limitDailyCheckIn)],
          account: account as Address,
          chain: ronin
        });
        
        return {
          hash,
          wait: async () => {
            return publicClient.waitForTransactionReceipt({ hash });
          }
        };
      },
      transferOwnership: async (newOwner: string) => {
        const account = await signer.getAddress();
        const hash = await writeCheckInContract(walletClient, {
          address: contractAddress as Address,
          functionName: 'transferOwnership',
          args: [newOwner as Address],
          account: account as Address,
          chain: ronin
        });
        
        return {
          hash,
          wait: async () => {
            return publicClient.waitForTransactionReceipt({ hash });
          }
        };
      },
      
      // Complex functions with multiple return values
      getHistory: async (user: string, from: number, to: number, limit: number, offset: number) => {
        const result = await readCheckInContract(publicClient, {
          address: contractAddress as Address,
          functionName: 'getHistory',
          args: [user as Address, BigInt(from), BigInt(to), BigInt(limit), BigInt(offset)]
        });
        
        if (result && typeof result === 'object' && 'numPeriod' in result && 'periods' in result && 'streakCounts' in result) {
          const typedResult = result as {
            numPeriod: bigint;
            periods: bigint[];
            streakCounts: bigint[];
          };
          
          return {
            numPeriod: { toNumber: () => Number(typedResult.numPeriod) },
            periods: typedResult.periods.map((p: bigint) => ({ toNumber: () => Number(p) })),
            streakCounts: typedResult.streakCounts.map((c: bigint) => ({ toNumber: () => Number(c) }))
          };
        }
        
        // Return default values if result is not as expected
        return {
          numPeriod: { toNumber: () => 0 },
          periods: [],
          streakCounts: []
        };
      }
    };
  } catch (error) {
    console.error('Error creating contract instance:', error);
    throw error;
  }
};

// Safe bigint conversion helper
export const safeNumberFromBigInt = (bn: bigint, defaultValue: number = 0): number => {
  try {
    return Number(bn);
  } catch (error) {
    console.error('Error converting bigint to number, possibly too large:', error);
    return defaultValue;
  }
};

// Safe string conversion helper
export const safeStringFromBigInt = (bn: bigint, defaultValue: string = '0'): string => {
  try {
    return bn.toString();
  } catch (error) {
    console.error('Error converting bigint to string:', error);
    return defaultValue;
  }
};

// Compatibility functions for ethers BigNumber
export const safeNumberFromBN = (bn: any, defaultValue: number = 0): number => {
  if (typeof bn === 'bigint') {
    return safeNumberFromBigInt(bn, defaultValue);
  }
  try {
    return bn.toNumber();
  } catch (error) {
    console.error('Error converting BigNumber to number:', error);
    return defaultValue;
  }
};

export const safeStringFromBN = (bn: any, defaultValue: string = '0'): string => {
  if (typeof bn === 'bigint') {
    return safeStringFromBigInt(bn, defaultValue);
  }
  try {
    return bn.toString();
  } catch (error) {
    console.error('Error converting BigNumber to string:', error);
    return defaultValue;
  }
};

// Encode a function call with an address parameter
const encodeAddressParam = (selector: string, address: string): string => {
  // Convert address to padded parameter (32 bytes)
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, '0');
  return `${selector}000000000000000000000000${paddedAddress}`;
};

// Perform a direct contract call with retries and fallbacks
export const directContractCall = async <T>(
  client: PublicClient,
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
    // Get chain information to determine which contract to use
    const chainId = client.chain?.id;
    const contractAddress = getContractAddress(chainId);
    
    // Try up to 3 times with increasing delays
    const result = await retry(async () => {
      return await client.call({
        to: contractAddress as Address,
        data: `0x${selector}${params}` as `0x${string}`
      });
    }, 3, 500);
    
    if (result.data) {
      return parser(result.data);
    }
  } catch (error) {
    console.error(`Direct contract call to ${method} failed:`, error);
  }
  
  return defaultValue;
};

// Network error detection and handling utilities
export const SUPPORTED_CHAIN_IDS = {
  RONIN_MAINNET: 2020,
  RONIN_TESTNET: 2021
};

export const COMMON_WRONG_NETWORKS = {
  ETHEREUM_MAINNET: 1,
  ETHEREUM_SEPOLIA: 11155111,
  POLYGON: 137,
  BSC: 56
};

/**
 * Verifica si el chainId corresponde a una red Ronin soportada
 */
export const isRoninNetwork = (chainId?: number): boolean => {
  if (!chainId) return false;
  return chainId === SUPPORTED_CHAIN_IDS.RONIN_MAINNET || chainId === SUPPORTED_CHAIN_IDS.RONIN_TESTNET;
};

/**
 * Detecta si hay un mismatch de red y devuelve información útil
 */
export const detectChainMismatch = (currentChainId?: number) => {
  if (!currentChainId) {
    return {
      isMismatch: true,
      currentNetwork: 'Unknown',
      expectedNetwork: 'Ronin Network',
      message: 'Unable to detect current network. Please verify your wallet is connected.'
    };
  }

  if (isRoninNetwork(currentChainId)) {
    return {
      isMismatch: false,
      currentNetwork: currentChainId === SUPPORTED_CHAIN_IDS.RONIN_MAINNET ? 'Ronin Mainnet' : 'Ronin Testnet',
      expectedNetwork: 'Ronin Network',
      message: null
    };
  }

  // Determine current network name
  let currentNetworkName = 'Unknown Network';
  switch (currentChainId) {
    case COMMON_WRONG_NETWORKS.ETHEREUM_MAINNET:
      currentNetworkName = 'Ethereum Mainnet';
      break;
    case COMMON_WRONG_NETWORKS.ETHEREUM_SEPOLIA:
      currentNetworkName = 'Ethereum Sepolia';
      break;
    case COMMON_WRONG_NETWORKS.POLYGON:
      currentNetworkName = 'Polygon';
      break;
    case COMMON_WRONG_NETWORKS.BSC:
      currentNetworkName = 'Binance Smart Chain';
      break;
    default:
      currentNetworkName = `Unknown Network (Chain ID: ${currentChainId})`;
  }

  return {
    isMismatch: true,
    currentNetwork: currentNetworkName,
    expectedNetwork: 'Ronin Network',
    message: `Your wallet is connected to ${currentNetworkName}. This application requires Ronin Network (Chain ID: ${SUPPORTED_CHAIN_IDS.RONIN_MAINNET}).`
  };
};

/**
 * Genera un mensaje de error amigable para problemas de red
 */
export const getNetworkErrorMessage = (currentChainId?: number): string => {
  const mismatch = detectChainMismatch(currentChainId);
  
  if (!mismatch.isMismatch) {
    return '';
  }

  return `${mismatch.message}

To switch to Ronin Network:
1. Open your wallet settings
2. Add or select Ronin Network
3. Use these details:
   • RPC URL: https://api.roninchain.com/rpc
   • Chain ID: ${SUPPORTED_CHAIN_IDS.RONIN_MAINNET}
   • Currency: RON
4. Refresh the page`;
};

/**
 * Detecta si un error está relacionado con problemas de red
 */
export const isNetworkRelatedError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorString = error.toString?.()?.toLowerCase() || '';
  
  // Patrones comunes de errores de red
  const networkErrorPatterns = [
    'does not match the target chain',
    'chain id',
    'network',
    'returned no data',
    'contract does not have the function',
    'address is not a contract',
    'execution reverted',
    'call exception'
  ];
  
  return networkErrorPatterns.some(pattern => 
    errorMessage.includes(pattern) || errorString.includes(pattern)
  );
};

/**
 * Procesa un error y devuelve un mensaje amigable si está relacionado con la red
 */
export const processNetworkError = (error: any, currentChainId?: number): string | null => {
  if (!isNetworkRelatedError(error)) {
    return null;
  }
  
  const mismatch = detectChainMismatch(currentChainId);
  if (mismatch.isMismatch) {
    return getNetworkErrorMessage(currentChainId);
  }
  
  // If on correct network but other network errors
  return 'Blockchain connection error. Please check your internet connection and try again.';
};
