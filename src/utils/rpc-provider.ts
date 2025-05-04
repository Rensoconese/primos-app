import { ethers } from 'ethers';

// Definición de la red Ronin - Parámetros explícitos para eliminar dependencia en detección automática
const RONIN_NETWORK = {
  chainId: 2020, // Ronin Mainnet Chain ID
  name: 'Ronin',
  ensAddress: undefined, // Debe ser undefined en lugar de null para cumplir con el tipo Network
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
 * Crea un proveedor JsonRpc para la red Ronin usando Moralis
 * con parámetros de red explícitos para evitar problemas de detección de red
 */
export const createRoninProviderWithFallback = async (): Promise<ethers.providers.JsonRpcProvider> => {
  console.log('⚡ Creando conexión directa a Ronin via Moralis primario...');
  
  // Headers para autenticación de Moralis
  const moralisHeaders = MORALIS_API_KEY ? {
    'x-api-key': MORALIS_API_KEY
  } : undefined;
  
  // Intentar con el endpoint primario de Moralis
  try {
    // Configura el proveedor con el endpoint primario de Moralis y sin referrer
    const provider = new ethers.providers.JsonRpcProvider(
      {
        url: PRIMARY_RPC_URL,
        headers: {
          ...fetchOptions.headers,
          ...moralisHeaders
        },
        fetchOptions: {
          referrerPolicy: 'no-referrer'
        }
      }, 
      RONIN_NETWORK
    );
    
    // Verificar conexión con una llamada simple
    console.log('📡 Probando conexión a Ronin via Moralis primario...');
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Conexión exitosa a Moralis primario. Bloque actual: ${blockNumber}`);
    
    return provider;
  } catch (primaryError) {
    console.error('❌ Error al conectar con Moralis primario:', primaryError);
    
    // Intentar con el endpoint de respaldo de Moralis
    if (BACKUP_RPC_URL) {
      try {
        console.log('🔄 Intentando conexión via Moralis secundario...');
        
        const backupProvider = new ethers.providers.JsonRpcProvider(
          {
            url: BACKUP_RPC_URL,
            headers: {
              ...fetchOptions.headers,
              ...moralisHeaders
            },
            fetchOptions: {
              referrerPolicy: 'no-referrer'
            }
          },
          RONIN_NETWORK
        );
        
        // Verificar que funciona
        const blockNumber = await backupProvider.getBlockNumber();
        console.log(`✅ Conexión exitosa a Moralis secundario. Bloque actual: ${blockNumber}`);
        
        return backupProvider;
      } catch (backupError) {
        console.error('❌ Conexión a Moralis secundario falló:', backupError);
      }
    }
    
    
    // Último recurso - RPC público
    try {
      console.log('⚠️ Intentando conexión via RPC público (no recomendado)...');
      
      const publicProvider = new ethers.providers.JsonRpcProvider(
        {
          url: 'https://api.roninchain.com/rpc',
          // Aplicar también la configuración no-referrer al proveedor público
          headers: fetchOptions.headers,
          fetchOptions: {
            referrerPolicy: 'no-referrer'
          }
        },
        RONIN_NETWORK
      );
      
      // Verificar que funciona
      const blockNumber = await publicProvider.getBlockNumber();
      console.log(`✅ Conexión exitosa a RPC público. Bloque actual: ${blockNumber}`);
      
      return publicProvider;
    } catch (publicError) {
      console.error('❌ Todos los intentos de conexión fallaron');
      throw new Error(`No se pudo conectar a la red Ronin: ${(primaryError as Error).message}`);
    }
  }
};

/**
 * Crea una wallet conectada a la red Ronin con la clave privada proporcionada
 */
export const createRoninWalletWithFallback = async (privateKey: string): Promise<ethers.Wallet> => {
  const provider = await createRoninProviderWithFallback();
  return new ethers.Wallet(privateKey, provider);
};
