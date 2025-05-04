import { ethers } from 'ethers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createDirectWallet, getBlockNumberDirect, callRpcDirectly } from '@/utils/direct-rpc';
import { logDetailedError } from '@/utils/retry-utils';
import { updateLeaderboard } from '@/utils/supabase';

// Configuración
const TOKEN_CONTRACT_ADDRESS = '0xE3a334D6b7681D0151b81964CAf6353905e24B1b'; // Fire Dust
const DISTRIBUTOR_ADDRESS = '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF'; // Wallet pool
const DISTRIBUTOR_PRIVATE_KEY = process.env.REWARD_POOL_PRIVATE_KEY;
const RPC_URL = process.env.RONIN_RPC_URL || 'https://api.roninchain.com/rpc';
const TOKEN_ID = 4; // ID del token Fire Dust

// Importación completa del ABI del token de los archivos de utilities
import { FireDustABI } from '@/utils/token-abi';

// ABI extendido para casos especiales - incluye ambas opciones (ERC1155 y ERC20)
const TOKEN_ABI = [
  ...FireDustABI,
  
  // Funciones adicionales ERC20 por si acaso el token las soporta
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  
  // Funciones adicionales para compatibilidad con contratos menos estándar
  "function setApprovalForAll(address operator, bool approved)"
];

// Definir tipo para endpoints RPC
type RpcEndpoint = {
  url: string;
  apiKey?: string;
  name: string;
};

// Función para obtener el total de tokens reclamados por un usuario
async function getUserTotalClaimedTokens(walletAddress: string, supabase: any) {
  try {
    const { data, error } = await supabase
      .from('rewards')
      .select('tokens_received')
      .eq('wallet_address', walletAddress.toLowerCase());
      
    if (error) throw error;
    
    console.log('Rewards data for wallet', walletAddress, ':', data);
    
    // Calcula el total sumando los tokens_received
    const totalClaimed = data.reduce((total: number, reward: any) => total + (reward.tokens_received || 0), 0);
    
    console.log('Total claimed tokens calculated from rewards:', totalClaimed);
    
    return totalClaimed;
  } catch (err) {
    console.error('Error fetching claimed tokens:', err);
    return 0;
  }
}

// Función para enviar una transacción directamente vía RPC
async function sendRawTransaction(
  rpcUrl: string, 
  signedTx: string, 
  apiKey?: string
): Promise<string> {
  const result = await callRpcDirectly(
    rpcUrl,
    'eth_sendRawTransaction',
    [signedTx],
    apiKey
  );
  
  return result;
}

export async function POST(request: Request) {
  console.log('Iniciando proceso de reclamación de tokens (endpoint simplificado)...');
  
  try {
    const supabase = await createClient();
    
    // Extraer datos del request
    const body = await request.json();
    const { walletAddress, amount } = body;
    
    console.log('Datos de la solicitud:', { walletAddress, amount });
    
    // Validaciones básicas
    if (!walletAddress || !ethers.utils.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Dirección de wallet inválida' },
        { status: 400 }
      );
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json(
        { error: 'Cantidad inválida' },
        { status: 400 }
      );
    }

    // Verificar que el usuario tenga suficientes puntos
    // Nota: El claimeo NO tiene restricciones de tiempo - los usuarios pueden reclamar 
    // en cualquier momento siempre que tengan suficientes puntos acumulados
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('total_points, id')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (userError) {
      console.error('Error al obtener datos del usuario:', userError);
      return NextResponse.json(
        { error: 'Error al verificar puntos del usuario' },
        { status: 500 }
      );
    }

    if (!userData || userData.total_points < Number(amount)) {
      return NextResponse.json(
        { error: 'Puntos insuficientes' },
        { status: 400 }
      );
    }
    
    console.log('Puntos del usuario verificados:', userData.total_points);

    // Verificar que la clave privada del distribuidor esté configurada
    if (!DISTRIBUTOR_PRIVATE_KEY) {
      console.error('Clave privada del distribuidor no configurada');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Eliminar el '0x' prefijo si existe
    const privateKey = DISTRIBUTOR_PRIVATE_KEY.startsWith('0x') 
      ? DISTRIBUTOR_PRIVATE_KEY 
      : `0x${DISTRIBUTOR_PRIVATE_KEY}`;
    
    // Conectar con la blockchain usando el sistema de fallback
    console.log('Conectando con la blockchain usando el sistema de fallback...');
    
    // Declaraciones iniciales
    let distributorWallet: ethers.Wallet | null = null;
    let connectedEndpoint: RpcEndpoint | null = null;
    
    try {
      console.log('NUEVO ENFOQUE: Usando llamadas directas sin providers estándar...');
      
      // Ordenar endpoints por prioridad
      const endpoints: RpcEndpoint[] = [
        // Moralis con API key (primera opción)
        { url: process.env.RONIN_RPC_URL || '', apiKey: process.env.MORALIS_API_KEY, name: 'Moralis primario' },
        // Moralis secundario (segunda opción)
        { url: process.env.RONIN_RPC_URL_BACKUP || '', apiKey: process.env.MORALIS_API_KEY, name: 'Moralis secundario' },
        // Público como último recurso
        { url: 'https://api.roninchain.com/rpc', apiKey: undefined, name: 'RPC público' }
      ].filter(e => !!e.url); // Filtrar endpoints sin URL
      
      // Verificar conexión a cada endpoint mediante llamada RPC directa
      for (const endpoint of endpoints) {
        try {
          console.log(`Probando conexión directa a ${endpoint.name} (${endpoint.url})...`);
          const blockNumber = await getBlockNumberDirect(endpoint.url, endpoint.apiKey);
          console.log(`✅ Conectado a ${endpoint.name}. Bloque actual: ${blockNumber}`);
          connectedEndpoint = endpoint;
          break; // Salir del bucle si la conexión fue exitosa
        } catch (endpointError) {
          console.error(`❌ Error al conectar con ${endpoint.name}:`, endpointError);
          // Continuar con el siguiente endpoint
        }
      }
      
      if (!connectedEndpoint) {
        throw new Error('No se pudo conectar a ningún endpoint RPC disponible');
      }
      
      // Crear wallet usando nuestro método de conexión directa
      console.log(`Creando wallet usando endpoint: ${connectedEndpoint.name}`);
      distributorWallet = await createDirectWallet(
        privateKey, 
        connectedEndpoint.url, 
        connectedEndpoint.apiKey
      );
      
      console.log('Wallet del distribuidor conectada:', distributorWallet.address);
      
      // Verificar que la dirección de la wallet coincide con la esperada
      if (distributorWallet.address.toLowerCase() !== DISTRIBUTOR_ADDRESS.toLowerCase()) {
        console.warn(`Advertencia: La dirección de la wallet (${distributorWallet.address}) no coincide con la dirección esperada (${DISTRIBUTOR_ADDRESS})`);
      }
    } catch (networkError: any) {
      console.error('Error al conectar con la red Ronin:', networkError);
      logDetailedError(networkError, 'Network Connection');
      
      return NextResponse.json(
        { 
          error: 'Error de conexión a la red', 
          details: 'No se pudo conectar con la red Ronin. Por favor intenta más tarde.',
          code: networkError.code || 'NETWORK_ERROR' 
        },
        { status: 503 } // Service Unavailable
      );
    }
    
    // Verificar que se creó correctamente la wallet
    if (!distributorWallet || !connectedEndpoint) {
      console.error('No se pudo inicializar correctamente la wallet o el endpoint RPC');
      return NextResponse.json(
        { error: 'Error de inicialización', details: 'No se pudo inicializar correctamente la conexión con la blockchain' },
        { status: 500 }
      );
    }
    
    // Cantidad de tokens a transferir
    const tokenAmount = Number(amount);
    
    // Usar ABI Interface para codificar correctamente las llamadas a funciones
    const abiInterface = new ethers.utils.Interface(TOKEN_ABI);
    
    try {
      console.log('Realizando llamadas directas al contrato...');
      
      // Obtenemos directamente el balance como ERC1155
      console.log('Obteniendo balance como ERC1155...');
      let distributorBalance: ethers.BigNumber;
      
      try {
        // Codificar la llamada a balanceOf(address,uint256) para ERC1155
        const balanceOfData = abiInterface.encodeFunctionData('balanceOf(address,uint256)', [
          distributorWallet.address,
          TOKEN_ID
        ]);
        
        // Llamar directamente al contrato
        const result = await callRpcDirectly(
          connectedEndpoint.url,
          'eth_call',
          [{
            to: TOKEN_CONTRACT_ADDRESS,
            data: balanceOfData
          }, 'latest'],
          connectedEndpoint.apiKey
        );
        
        // Decodificar el resultado
        distributorBalance = ethers.BigNumber.from(result);
        console.log('Balance ERC1155:', distributorBalance.toString());
      } catch (error: any) {
        console.error('Error al obtener balance ERC1155:', error);
        return NextResponse.json(
          { 
            error: 'Error al verificar balance del distribuidor', 
            details: 'No se pudo obtener el balance de tokens.' 
          },
          { status: 500 }
        );
      }
      
      // Verificar si hay suficientes tokens
      if (distributorBalance.lt(ethers.BigNumber.from(tokenAmount))) {
        return NextResponse.json(
          { error: 'Tokens insuficientes en la wallet distribuidora' },
          { status: 400 }
        );
      }
      
      // Preparar la transferencia ERC1155
      let txHash: string;
      
      console.log('Preparando transacción para ERC1155...');
        
      // Verificar si el contrato requiere aprobación primero
      const isApprovedData = abiInterface.encodeFunctionData('isApprovedForAll', [
        distributorWallet.address,
        distributorWallet.address
      ]);
      
      const approvalResult = await callRpcDirectly(
        connectedEndpoint.url,
        'eth_call',
        [{
          to: TOKEN_CONTRACT_ADDRESS,
          data: isApprovedData
        }, 'latest'],
        connectedEndpoint.apiKey
      );
      
      const isApproved = approvalResult === '0x0000000000000000000000000000000000000000000000000000000000000001';
      
      if (!isApproved) {
        console.log('El distribuidor necesita aprobación para transferir tokens...');
        
        // Codificar la llamada a setApprovalForAll
        const approveData = abiInterface.encodeFunctionData('setApprovalForAll', [
          distributorWallet.address,
          true
        ]);
        
        // Crear transacción de aprobación
        const txCount = await callRpcDirectly(
          connectedEndpoint.url,
          'eth_getTransactionCount',
          [distributorWallet.address, 'latest'],
          connectedEndpoint.apiKey
        );
        
        const approveTxParams = {
          to: TOKEN_CONTRACT_ADDRESS,
          nonce: txCount,
          gasPrice: ethers.utils.parseUnits('30', 'gwei'),
          gasLimit: 200000,
          data: approveData,
          chainId: 2020 // Ronin Chain ID
        };
        
        const signedApproveTx = await distributorWallet.signTransaction(approveTxParams);
        
        // Enviar transacción de aprobación
        const approvalTxHash = await sendRawTransaction(
          connectedEndpoint.url,
          signedApproveTx,
          connectedEndpoint.apiKey
        );
        
        console.log('Transacción de aprobación enviada:', approvalTxHash);
        
        // Esperar a que se confirme la aprobación
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Codificar la llamada a safeTransferFrom
      const transferData = abiInterface.encodeFunctionData('safeTransferFrom(address,address,uint256,uint256,bytes)', [
        distributorWallet.address,
        walletAddress,
        TOKEN_ID,
        tokenAmount,
        "0x" // Datos mínimos requeridos
      ]);
      
      // Crear transacción 
      const txCount = await callRpcDirectly(
        connectedEndpoint.url,
        'eth_getTransactionCount',
        [distributorWallet.address, 'latest'],
        connectedEndpoint.apiKey
      );
      
      const txParams = {
        to: TOKEN_CONTRACT_ADDRESS,
        nonce: txCount,
        gasPrice: ethers.utils.parseUnits('30', 'gwei'), // Incrementado a 30 Gwei para superar el mínimo requerido de 21 Gwei
        gasLimit: 200000, // ERC1155 puede requerir más gas
        data: transferData,
        chainId: 2020 // Ronin Chain ID
      };
      
      const signedTx = await distributorWallet.signTransaction(txParams);
      
      // Enviar transacción firmada
      txHash = await sendRawTransaction(
        connectedEndpoint.url,
        signedTx,
        connectedEndpoint.apiKey
      );
      
      console.log('Transacción ERC1155 enviada:', txHash);
      
      // Actualizar registros en la base de datos
      console.log('Actualizando registros en la base de datos...');
      
      // Registrar la transacción
      const { error: rewardError } = await supabase
        .from('rewards')
        .insert({
          user_id: userData.id,
          wallet_address: walletAddress.toLowerCase(),
          points_spent: Number(amount),
          tokens_received: tokenAmount,
          transaction_hash: txHash
        });
      
      if (rewardError) {
        console.error('Error al registrar recompensa en la base de datos:', rewardError);
      }
      
      // Actualizar puntos del usuario
      const newTotalPoints = userData.total_points - Number(amount);
      const { error: updateError } = await supabase
        .from('users')
        .update({ total_points: newTotalPoints })
        .eq('id', userData.id);
      
      if (updateError) {
        console.error('Error al actualizar puntos del usuario:', updateError);
      }
      
      // Obtener el total de tokens reclamados por el usuario
      const totalTokensClaimed = await getUserTotalClaimedTokens(walletAddress, supabase);
      
      // Usar la función centralizada para actualizar el leaderboard
      const { success, error: leaderboardError } = await updateLeaderboard(walletAddress, {
        tokens_claimed: totalTokensClaimed,
        last_active: new Date().toISOString()
      });
      
      if (!success || leaderboardError) {
        console.error('Error al actualizar leaderboard:', leaderboardError);
      }
      
      console.log('Proceso de reclamación completado con éxito');
      return NextResponse.json({
        success: true,
        txHash: txHash,
        tokens_received: tokenAmount,
        new_balance: newTotalPoints
      });
      
    } catch (error: any) {
      console.error('Error detallado en la transferencia:', error);
      
      // Registrar detalles adicionales del error
      if (error.code) console.error('Código de error:', error.code);
      if (error.reason) console.error('Razón del error:', error.reason);
      if (error.method) console.error('Método:', error.method);
      if (error.transaction) console.error('Transacción:', error.transaction);
      
      // Implementar mecanismo de fallback - registrar en tabla de pending_rewards
      console.log('Implementando mecanismo de fallback debido a fallo en la transacción');
      
      try {
        // Registrar recompensa pendiente
        const { error: pendingError } = await supabase
          .from('pending_rewards')
          .insert({
            user_id: userData.id,
            wallet_address: walletAddress.toLowerCase(),
            amount: tokenAmount,
            status: 'pending',
            error_details: error.message || 'Error desconocido',
            created_at: new Date().toISOString()
          });
          
        if (pendingError) {
          console.error('Error al registrar recompensa pendiente:', pendingError);
        } else {
          console.log('Recompensa pendiente registrada correctamente');
          
          // Devolver un mensaje más amigable al usuario
          return NextResponse.json({
            error: 'Procesamiento de transacción retrasado',
            details: 'Tu solicitud ha sido registrada pero no pudo procesarse inmediatamente. Los tokens serán enviados a tu wallet pronto.',
            fallback_activated: true,
            code: error.code || 'UNKNOWN'
          }, { status: 202 }); // 202 Accepted
        }
      } catch (fallbackError) {
        console.error('Error en el mecanismo de fallback:', fallbackError);
      }
      
      // Si todo falla, devolver error original
      return NextResponse.json(
        { error: error.message || 'Error en la transferencia' },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('Error general:', error);
    return NextResponse.json(
      { error: 'Error del servidor', details: error.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}
