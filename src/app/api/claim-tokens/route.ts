import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { 
  createDirectPublicClient, 
  createDirectWalletClient, 
  getBlockNumberDirect, 
  callRpcDirectly,
  sendRawTransaction as sendRawTx,
  signAndSendTransaction
} from '@/utils/direct-rpc-viem';
import { logDetailedError } from '@/utils/retry-utils';
import { 
  isAddress, 
  parseGwei, 
  encodeFunctionData, 
  type Address, 
  type Hash,
  type TransactionRequest
} from 'viem';
import { ronin } from '@/utils/chain';

// Configuración
const TOKEN_CONTRACT_ADDRESS = '0xE3a334D6b7681D0151b81964CAf6353905e24B1b' as Address; // Fire Dust
const DISTRIBUTOR_ADDRESS = '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF' as Address; // Wallet pool
const DISTRIBUTOR_PRIVATE_KEY = process.env.REWARD_POOL_PRIVATE_KEY;
const RPC_URL = process.env.RONIN_RPC_URL || 'https://api.roninchain.com/rpc';
const TOKEN_ID = BigInt(4); // ID del token Fire Dust (como BigInt para viem)

// Importación completa del ABI del token de los archivos de utilities
import { FIRE_DUST_ABI } from '@/utils/token-abi';

// Definir tipo para endpoints RPC
type RpcEndpoint = {
  url: string;
  apiKey?: string;
  name: string;
};

// Función para obtener el total de tokens reclamados por un usuario
async function getUserTotalClaimedTokens(walletAddress: string, supabase: any) {
  try {
    // Asegurarse de que la dirección esté en minúsculas para consistencia
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Consulta directa con SUM para evitar problemas de cálculo en el cliente
    const { data, error } = await supabase
      .from('rewards')
      .select('tokens_received')
      .eq('wallet_address', normalizedAddress);
      
    if (error) throw error;
    
    console.log(`Rewards data for wallet ${normalizedAddress}:`, data);
    console.log(`Number of reward records found: ${data.length}`);
    
    // Verificar cada registro para asegurar que todos los valores son válidos
    data.forEach((reward: any, index: number) => {
      console.log(`Record ${index}: tokens_received = ${reward.tokens_received}`);
      if (reward.tokens_received === null || reward.tokens_received === undefined) {
        console.warn(`Warning: Invalid tokens_received value in record ${index}`);
      }
    });
    
    // Calcula el total sumando los tokens_received
    const totalClaimed = data.reduce((total: number, reward: any) => {
      const tokenValue = Number(reward.tokens_received || 0);
      console.log(`Adding ${tokenValue} to total ${total}`);
      return total + tokenValue;
    }, 0);
    
    console.log(`Total claimed tokens calculated from rewards: ${totalClaimed}`);
    
    // Verificación adicional: obtener el total directamente de la base de datos usando SUM
    const { data: sumData, error: sumError } = await supabase
      .rpc('sum_tokens_received', { wallet_addr: normalizedAddress });
    
    if (!sumError && sumData !== null) {
      console.log(`Total from database SUM function: ${sumData}`);
      
      // Si hay discrepancia, usar el valor de la suma directa
      if (sumData !== totalClaimed) {
        console.warn(`Discrepancy detected: calculated=${totalClaimed}, database sum=${sumData}`);
        return sumData;
      }
    } else {
      console.log('Could not get sum from database, using calculated value');
    }
    
    return totalClaimed;
  } catch (err) {
    console.error('Error fetching claimed tokens:', err);
    return 0;
  }
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
    if (!walletAddress || !isAddress(walletAddress as Address)) {
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
    let connectedEndpoint: RpcEndpoint | null = null;
    
    try {
      console.log('NUEVO ENFOQUE: Usando llamadas directas con viem...');
      
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
      
      // Crear cliente público usando viem
      console.log(`Creando cliente público usando endpoint: ${connectedEndpoint.name}`);
      const publicClient = await createDirectPublicClient(
        connectedEndpoint.url,
        connectedEndpoint.apiKey
      );
      
      // Crear cliente wallet usando viem
      console.log(`Creando cliente wallet usando endpoint: ${connectedEndpoint.name}`);
      const walletClient = await createDirectWalletClient(
        privateKey,
        connectedEndpoint.url,
        connectedEndpoint.apiKey
      );
      
      // Cantidad de tokens a transferir como BigInt
      const tokenAmount = BigInt(Number(amount));
      
      try {
        console.log('Realizando llamadas directas al contrato...');
        
        // Obtenemos directamente el balance como ERC1155
        console.log('Obteniendo balance como ERC1155...');
        let distributorBalance: bigint;
        
        try {
          // Codificar la llamada a balanceOf(address,uint256) para ERC1155
          const balanceOfData = encodeFunctionData({
            abi: FIRE_DUST_ABI,
            functionName: 'balanceOf',
            args: [DISTRIBUTOR_ADDRESS, TOKEN_ID]
          });
          
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
          
          // Decodificar el resultado como bigint
          distributorBalance = BigInt(result);
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
        if (distributorBalance < tokenAmount) {
          return NextResponse.json(
            { error: 'Tokens insuficientes en la wallet distribuidora' },
            { status: 400 }
          );
        }
        
        // Preparar la transferencia ERC1155
        let txHash: Hash;
        
        console.log('Preparando transacción para ERC1155...');
          
        // Verificar si el contrato requiere aprobación primero
        const isApprovedData = encodeFunctionData({
          abi: FIRE_DUST_ABI,
          functionName: 'isApprovedForAll',
          args: [DISTRIBUTOR_ADDRESS, DISTRIBUTOR_ADDRESS]
        });
        
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
          const approveData = encodeFunctionData({
            abi: FIRE_DUST_ABI,
            functionName: 'setApprovalForAll',
            args: [DISTRIBUTOR_ADDRESS, true]
          });
          
          // Crear transacción de aprobación
          const txCount = await callRpcDirectly(
            connectedEndpoint.url,
            'eth_getTransactionCount',
            [DISTRIBUTOR_ADDRESS, 'latest'],
            connectedEndpoint.apiKey
          );
          
          // Preparar los parámetros de la transacción
          const approveTxParams: TransactionRequest = {
            to: TOKEN_CONTRACT_ADDRESS,
            nonce: parseInt(txCount, 16),
            gasPrice: parseGwei('30'),
            gas: BigInt(200000),
            data: approveData
          };
          
          // Firmar y enviar la transacción de aprobación usando viem
          console.log('Firmando y enviando transacción de aprobación con viem...');
          const approvalTxHash = await signAndSendTransaction(
            walletClient,
            publicClient,
            approveTxParams
          );
          
          console.log('Transacción de aprobación enviada:', approvalTxHash);
          
          // Esperar a que se confirme la aprobación
          console.log('Esperando confirmación de la aprobación...');
          const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
          console.log('Aprobación confirmada:', approvalReceipt);
        }
        
        // Codificar la llamada a safeTransferFrom
        const transferData = encodeFunctionData({
          abi: FIRE_DUST_ABI,
          functionName: 'safeTransferFrom',
          args: [
            DISTRIBUTOR_ADDRESS, 
            walletAddress as Address, 
            TOKEN_ID, 
            tokenAmount, 
            "0x" // Datos mínimos requeridos
          ]
        });
        
        // Crear transacción 
        const txCount = await callRpcDirectly(
          connectedEndpoint.url,
          'eth_getTransactionCount',
          [DISTRIBUTOR_ADDRESS, 'latest'],
          connectedEndpoint.apiKey
        );
        
        // Preparar los parámetros de la transacción
        const txParams: TransactionRequest = {
          to: TOKEN_CONTRACT_ADDRESS,
          nonce: parseInt(txCount, 16),
          gasPrice: parseGwei('30'), // 30 Gwei
          gas: BigInt(200000), // ERC1155 puede requerir más gas
          data: transferData
        };
        
        // Firmar y enviar la transacción de transferencia usando viem
        console.log('Firmando y enviando transacción de transferencia con viem...');
        txHash = await signAndSendTransaction(
          walletClient,
          publicClient,
          txParams
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
            tokens_received: Number(tokenAmount),
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
        
        // Actualizar el leaderboard con los tokens reclamados
        const { updateLeaderboard } = await import('@/services/leaderboardService');
        await updateLeaderboard(walletAddress, {
          tokens_claimed: totalTokensClaimed,
          points_earned: newTotalPoints,
          last_active: new Date().toISOString()
        });
        
        console.log('Proceso de reclamación completado con éxito');
        return NextResponse.json({
          success: true,
          txHash: txHash,
          tokens_received: Number(tokenAmount),
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
              amount: Number(tokenAmount),
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
    
  } catch (error: any) {
    console.error('Error general:', error);
    return NextResponse.json(
      { error: 'Error del servidor', details: error.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}
