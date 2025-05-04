/**
 * Módulo para realizar llamadas directas a los RPC sin usar ethers.providers
 * Este enfoque alternativo puede ayudar a evitar problemas con el referrer
 */

import { ethers } from 'ethers';

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
 * Realiza una llamada RPC directa sin usar providers de ethers
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
 * Crea una wallet conectada usando un JsonRpcProvider estándar pero con opciones configuradas
 * para evitar problemas de referrer
 * @param privateKey La clave privada de la wallet
 * @param url URL del endpoint RPC
 * @param apiKey API key opcional
 * @returns Wallet de ethers
 */
export async function createDirectWallet(
  privateKey: string,
  url: string,
  apiKey?: string
): Promise<ethers.Wallet> {
  try {
    // Primero verificamos que podemos conectar
    const blockNumber = await getBlockNumberDirect(url, apiKey);
    console.log(`✅ Conexión exitosa a ${url}. Bloque actual: ${blockNumber}`);
    
    // En lugar de crear un BaseProvider personalizado, usamos un JsonRpcProvider configurado adecuadamente
    // JsonRpcProvider es más completo y tiene todas las funcionalidades necesarias incluyendo detección de red
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
    
    // Configuración completa que evita los problemas de referrer
    const providerConfig = {
      url,
      headers,
      skipFetchSetup: false, // Permitir que ethers maneje el fetch, pero con nuestros headers
      getNetwork: () => Promise.resolve({ name: "Ronin", chainId: 2020, ensAddress: undefined })
    };
    
    // Crear JsonRpcProvider con opciones personalizadas
    const provider = new ethers.providers.JsonRpcProvider(providerConfig, {
      name: "Ronin", 
      chainId: 2020,
      ensAddress: undefined
    });
    
    // Asegurarse de que la red está establecida correctamente (evita problemas de detección)
    provider.getNetwork = () => Promise.resolve({ 
      name: "Ronin", 
      chainId: 2020,
      ensAddress: undefined,
      _defaultProvider: () => provider
    });
    
    // Crear wallet con el provider configurado
    return new ethers.Wallet(privateKey, provider);
  } catch (error) {
    console.error(`Error creating direct wallet for ${url}:`, error);
    throw error;
  }
}

/**
 * Crea una instancia de contrato usando el método de llamadas directas
 * Esta función es necesaria porque los contratos normales dependen de la detección de red
 * @param address Dirección del contrato
 * @param abi ABI del contrato
 * @param wallet Wallet conectada a la blockchain
 */
export function createDirectContract(
  address: string,
  abi: ethers.ContractInterface,
  wallet: ethers.Wallet
): ethers.Contract {
  // Crear el contrato normal
  const contract = new ethers.Contract(address, abi, wallet);
  
  // Devolver el contrato
  return contract;
}
