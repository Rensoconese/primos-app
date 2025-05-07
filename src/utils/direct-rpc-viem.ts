/**
 * Módulo para realizar llamadas directas a los RPC usando viem
 * Este enfoque alternativo puede ayudar a evitar problemas con el referrer
 */

import { 
  createWalletClient, 
  http, 
  custom, 
  type WalletClient, 
  type Transport, 
  type Chain,
  type Account,
  type Hash,
  createPublicClient,
  type PublicClient,
  getContract,
  type Address,
  type Abi,
  type TransactionRequest,
  type TransactionSerializable
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ronin } from '@/utils/chain';

// Definición de tipo para headers que permita propiedades adicionales
type HeadersWithApiKey = {
  'Content-Type': string;
  'User-Agent': string;
  'Origin': string;
  'Referrer-Policy': string;
  [key: string]: string; // Permite cualquier propiedad adicional de tipo string
};

// Configuración de headers y fetch para evitar problemas de referrer
const fetchOptions = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'RoninRpc/1.0.0',
    'Origin': 'https://localhost',
    'Referrer-Policy': 'no-referrer'
  } as HeadersWithApiKey,
  referrerPolicy: 'no-referrer' as RequestInit['referrerPolicy']
};

/**
 * Realiza una llamada RPC directa usando fetch
 * @param url URL del endpoint RPC
 * @param method Método RPC a llamar (ej: 'eth_blockNumber')
 * @param params Parámetros para el método
 * @param apiKey API key opcional para servicios que lo requieren
 */
export async function callRpcDirectly(
  url: string,
  method: string,
  params: any[] = [],
  apiKey?: string
): Promise<any> {
  // Crear payload JSON-RPC
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };
  
  // Añadir API key si es necesario (para Moralis)
  const headers = { ...fetchOptions.headers };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  
  try {
    // Realizar la llamada fetch directamente
    console.log(`Calling RPC directly: ${url}, method: ${method}`);
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    return data.result;
  } catch (error: any) {
    console.error(`Direct RPC call failed for ${url}:`, error);
    throw error;
  }
}

/**
 * Obtiene el número de bloque actual usando llamada RPC directa
 * @param url URL del endpoint RPC
 * @param apiKey API key opcional para servicios que lo requieren
 */
export async function getBlockNumberDirect(url: string, apiKey?: string): Promise<number> {
  const result = await callRpcDirectly(url, 'eth_blockNumber', [], apiKey);
  return parseInt(result, 16);
}

/**
 * Crea un transporte personalizado para viem que usa nuestras opciones de fetch
 * @param url URL del endpoint RPC
 * @param apiKey API key opcional
 */
export function createCustomTransport(url: string, apiKey?: string): Transport {
  // Crear headers personalizados
  const headers: HeadersWithApiKey = {
    'Content-Type': 'application/json',
    'User-Agent': 'RoninRPC/1.0.0',
    'Origin': 'https://localhost',
    'Referrer-Policy': 'no-referrer'
  };
  
  // Añadir API key si es necesario
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  
  // Crear función de fetch personalizada
  const customFetch = async (request: Request) => {
    // Crear una nueva Request con nuestros headers personalizados
    const newRequest = new Request(request, {
      headers: new Headers(headers),
      referrerPolicy: 'no-referrer'
    });
    
    return fetch(newRequest);
  };
  
  // Crear transporte personalizado
  return http(url, {
    fetchOptions: {
      headers,
      referrerPolicy: 'no-referrer'
    },
    // @ts-ignore - viem espera window.fetch, pero podemos usar nuestra función personalizada
    fetch: customFetch
  });
}

/**
 * Crea un cliente de wallet usando viem con opciones personalizadas
 * @param privateKey La clave privada de la wallet
 * @param url URL del endpoint RPC
 * @param apiKey API key opcional
 */
export async function createDirectWalletClient(
  privateKey: string,
  url: string,
  apiKey?: string
): Promise<WalletClient> {
  try {
    // Primero verificamos que podemos conectar
    const blockNumber = await getBlockNumberDirect(url, apiKey);
    console.log(`✅ Conexión exitosa a ${url}. Bloque actual: ${blockNumber}`);
    
    // Crear transporte personalizado
    const transport = createCustomTransport(url, apiKey);
    
    // Asegurarse de que la clave privada tenga el prefijo 0x
    const formattedPrivateKey = privateKey.startsWith('0x') 
      ? privateKey 
      : `0x${privateKey}`;
    
    // Crear una cuenta a partir de la clave privada
    const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
    console.log(`✅ Cuenta creada para la dirección: ${account.address}`);
    
    // Crear cliente de wallet con la cuenta específica
    const walletClient = createWalletClient({
      account,
      chain: ronin,
      transport
    });
    
    return walletClient;
  } catch (error) {
    console.error(`Error creating direct wallet client for ${url}:`, error);
    throw error;
  }
}

/**
 * Crea un cliente público usando viem con opciones personalizadas
 * @param url URL del endpoint RPC
 * @param apiKey API key opcional
 */
export async function createDirectPublicClient(
  url: string,
  apiKey?: string
): Promise<PublicClient> {
  try {
    // Primero verificamos que podemos conectar
    const blockNumber = await getBlockNumberDirect(url, apiKey);
    console.log(`✅ Conexión exitosa a ${url}. Bloque actual: ${blockNumber}`);
    
    // Crear transporte personalizado
    const transport = createCustomTransport(url, apiKey);
    
    // Crear cliente público
    const publicClient = createPublicClient({
      chain: ronin,
      transport
    });
    
    return publicClient;
  } catch (error) {
    console.error(`Error creating direct public client for ${url}:`, error);
    throw error;
  }
}

/**
 * Crea una instancia de contrato usando viem
 * @param address Dirección del contrato
 * @param abi ABI del contrato
 * @param publicClient Cliente público de viem
 * @param walletClient Cliente de wallet de viem (opcional, para funciones de escritura)
 */
export function createDirectContract<TAbi extends Abi>(
  address: Address,
  abi: TAbi,
  publicClient: PublicClient,
  walletClient?: WalletClient
) {
  return getContract({
    address,
    abi,
    client: { public: publicClient, wallet: walletClient }
  });
}

/**
 * Firma y envía una transacción usando viem
 * @param walletClient Cliente de wallet de viem
 * @param publicClient Cliente público de viem
 * @param txParams Parámetros de la transacción
 * @returns Hash de la transacción
 */
export async function signAndSendTransaction(
  walletClient: WalletClient,
  publicClient: PublicClient,
  txParams: TransactionRequest
): Promise<Hash> {
  try {
    console.log('Firmando y enviando transacción con viem...');
    
    // Verificar que el cliente de wallet tiene una cuenta configurada
    if (!walletClient.account) {
      throw new Error('Wallet client no tiene una cuenta configurada');
    }
    
    // Preparar la transacción para firmar
    const request = {
      account: walletClient.account,
      to: txParams.to,
      value: txParams.value,
      data: txParams.data,
      gas: txParams.gas,
      gasPrice: txParams.gasPrice,
      nonce: txParams.nonce,
      chain: ronin
    };
    
    // Firmar la transacción
    console.log('Firmando transacción...');
    const signedTransaction = await walletClient.signTransaction(request);
    
    // Obtener el endpoint RPC y API key del transporte
    const transport = publicClient.transport;
    let url = '';
    let apiKey: string | undefined = undefined;
    
    if ('url' in transport && typeof transport.url === 'string') {
      url = transport.url;
      
      // Intentar extraer la API key de las opciones de fetch si existen
      if ('fetchOptions' in transport && 
          transport.fetchOptions && 
          'headers' in transport.fetchOptions && 
          transport.fetchOptions.headers && 
          'x-api-key' in transport.fetchOptions.headers) {
        apiKey = transport.fetchOptions.headers['x-api-key'] as string;
      }
    } else {
      // Si no podemos obtener la URL del transporte, usar un valor por defecto
      url = 'https://api.roninchain.com/rpc';
    }
    
    // Enviar la transacción firmada
    console.log('Enviando transacción firmada...');
    const hash = await sendRawTransaction(url, signedTransaction, apiKey);
    
    console.log('Transacción enviada con hash:', hash);
    
    // Esperar a que la transacción se confirme
    console.log('Esperando confirmación de la transacción...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    console.log('Transacción confirmada:', receipt);
    
    return hash;
  } catch (error) {
    console.error('Error al firmar y enviar transacción:', error);
    throw error;
  }
}

/**
 * Envía una transacción firmada directamente vía RPC
 * @param url URL del endpoint RPC
 * @param signedTx Transacción firmada en formato hexadecimal
 * @param apiKey API key opcional
 */
export async function sendRawTransaction(
  url: string, 
  signedTx: string, 
  apiKey?: string
): Promise<Hash> {
  const result = await callRpcDirectly(
    url,
    'eth_sendRawTransaction',
    [signedTx],
    apiKey
  );
  
  return result as Hash;
}
