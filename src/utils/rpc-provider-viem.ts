import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  fallback, 
  custom, 
  type PublicClient, 
  type WalletClient,
  type Transport,
  type Chain
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ronin } from './chain';

// Definición de la red Ronin - Parámetros explícitos para eliminar dependencia en detección automática
const RONIN_NETWORK = {
  id: 2020, // Ronin Mainnet Chain ID
  name: 'Ronin',
};

// URLs de Moralis para Ronin
const PRIMARY_RPC_URL = process.env.RONIN_RPC_URL || 'https://api.roninchain.com/rpc';
const BACKUP_RPC_URL = process.env.RONIN_RPC_URL_BACKUP;
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;

// Tiempo de espera ampliado para permitir conexiones más lentas
const CONNECTION_TIMEOUT = 15000; // 15 segundos

// Configuración de fetch para evitar problemas de referrer
const fetchOptions = {
  referrerPolicy: 'no-referrer',
  headers: {
    'Referrer-Policy': 'no-referrer',
    'User-Agent': 'RoninWallet/1.0.0'
  }
};

/**
 * Crea un cliente público para la red Ronin usando Moralis
 * con parámetros de red explícitos para evitar problemas de detección de red
 */
export const createRoninPublicClientWithFallback = async (): Promise<PublicClient> => {
  console.log('⚡ Creando conexión directa a Ronin via Moralis primario...');
  
  // Headers para autenticación de Moralis
  const moralisHeaders = MORALIS_API_KEY ? {
    'x-api-key': MORALIS_API_KEY,
    ...fetchOptions.headers
  } : fetchOptions.headers;
  
  // Crear array de transportes para fallback
  const transports: Transport[] = [];
  
  // Intentar con el endpoint primario de Moralis
  try {
    // Configura el transporte con el endpoint primario de Moralis y sin referrer
    const primaryTransport = http(PRIMARY_RPC_URL, {
      fetchOptions: {
        headers: moralisHeaders,
        referrerPolicy: 'no-referrer'
      },
      timeout: CONNECTION_TIMEOUT
    });
    
    transports.push(primaryTransport);
    
    // Verificar conexión con una llamada simple
    console.log('📡 Probando conexión a Ronin via Moralis primario...');
    const publicClient = createPublicClient({
      chain: ronin,
      transport: primaryTransport
    });
    
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`✅ Conexión exitosa a Moralis primario. Bloque actual: ${blockNumber}`);
    
    return publicClient;
  } catch (primaryError) {
    console.error('❌ Error al conectar con Moralis primario:', primaryError);
    
    // Intentar con el endpoint de respaldo de Moralis
    if (BACKUP_RPC_URL) {
      try {
        console.log('🔄 Intentando conexión via Moralis secundario...');
        
        const backupTransport = http(BACKUP_RPC_URL, {
          fetchOptions: {
            headers: moralisHeaders,
            referrerPolicy: 'no-referrer'
          },
          timeout: CONNECTION_TIMEOUT
        });
        
        transports.push(backupTransport);
        
        // Verificar que funciona
        const backupClient = createPublicClient({
          chain: ronin,
          transport: backupTransport
        });
        
        const blockNumber = await backupClient.getBlockNumber();
        console.log(`✅ Conexión exitosa a Moralis secundario. Bloque actual: ${blockNumber}`);
        
        return backupClient;
      } catch (backupError) {
        console.error('❌ Conexión a Moralis secundario falló:', backupError);
      }
    }
    
    // Último recurso - RPC público
    try {
      console.log('⚠️ Intentando conexión via RPC público (no recomendado)...');
      
      const publicTransport = http('https://api.roninchain.com/rpc', {
        fetchOptions: {
          headers: fetchOptions.headers,
          referrerPolicy: 'no-referrer'
        },
        timeout: CONNECTION_TIMEOUT
      });
      
      transports.push(publicTransport);
      
      // Verificar que funciona
      const publicClient = createPublicClient({
        chain: ronin,
        transport: publicTransport
      });
      
      const blockNumber = await publicClient.getBlockNumber();
      console.log(`✅ Conexión exitosa a RPC público. Bloque actual: ${blockNumber}`);
      
      return publicClient;
    } catch (publicError) {
      console.error('❌ Todos los intentos de conexión fallaron');
      
      // Si todos los intentos individuales fallaron, intentar con fallback
      if (transports.length > 0) {
        try {
          console.log('🔄 Intentando conexión con fallback entre todos los transportes...');
          
          const fallbackClient = createPublicClient({
            chain: ronin,
            transport: fallback(transports)
          });
          
          // Verificar que funciona
          const blockNumber = await fallbackClient.getBlockNumber();
          console.log(`✅ Conexión exitosa con fallback. Bloque actual: ${blockNumber}`);
          
          return fallbackClient;
        } catch (fallbackError) {
          console.error('❌ Conexión con fallback falló:', fallbackError);
        }
      }
      
      throw new Error(`No se pudo conectar a la red Ronin: ${(primaryError as Error).message}`);
    }
  }
};

/**
 * Crea un cliente wallet conectado a la red Ronin con la clave privada proporcionada
 */
export const createRoninWalletClientWithFallback = async (privateKey: string): Promise<WalletClient> => {
  // Asegurarse de que la clave privada tenga el prefijo 0x
  const formattedPrivateKey = privateKey.startsWith('0x') 
    ? privateKey 
    : `0x${privateKey}`;
  
  // Crear una cuenta a partir de la clave privada
  const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
  
  // Crear un nuevo transporte para el cliente wallet
  const transport = http(PRIMARY_RPC_URL, {
    fetchOptions: {
      headers: MORALIS_API_KEY ? {
        'x-api-key': MORALIS_API_KEY,
        ...fetchOptions.headers
      } : fetchOptions.headers,
      referrerPolicy: 'no-referrer'
    },
    timeout: CONNECTION_TIMEOUT
  });
  
  // Crear cliente wallet
  const walletClient = createWalletClient({
    account,
    chain: ronin,
    transport
  });
  
  return walletClient;
};

/**
 * Crea un objeto que contiene tanto el cliente público como el cliente wallet
 * para facilitar el uso en componentes
 */
export const createRoninClients = async (privateKey?: string): Promise<{
  publicClient: PublicClient;
  walletClient?: WalletClient;
}> => {
  const publicClient = await createRoninPublicClientWithFallback();
  
  if (privateKey) {
    const walletClient = await createRoninWalletClientWithFallback(privateKey);
    return { publicClient, walletClient };
  }
  
  return { publicClient };
};
