import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isAddress, createPublicClient, createWalletClient, http, encodeFunctionData, decodeFunctionResult, parseAbi, getAddress, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ronin } from '@/utils/chain';
import { FIRE_DUST_ABI } from '@/utils/token-abi-viem';
import { retry } from '@/utils/contract-viem';

// Configuración
const TOKEN_CONTRACT_ADDRESS = '0xE3a334D6b7681D0151b81964CAf6353905e24B1b'; // Fire Dust
const DISTRIBUTOR_ADDRESS = '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF'; // Wallet pool
const DISTRIBUTOR_PRIVATE_KEY = process.env.REWARD_POOL_PRIVATE_KEY;
const TOKEN_ID = 4; // ID del token Fire Dust

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

// Crear cliente público y wallet client
const createClients = async () => {
  // Verificar que la clave privada esté configurada
  if (!DISTRIBUTOR_PRIVATE_KEY) {
    throw new Error('Distributor private key not configured');
  }
  
  // Crear account a partir de la clave privada
  const privateKey = DISTRIBUTOR_PRIVATE_KEY.startsWith('0x') 
    ? DISTRIBUTOR_PRIVATE_KEY 
    : `0x${DISTRIBUTOR_PRIVATE_KEY}`;
  
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  // Configuración de headers para evitar problemas de referrer
  const headers: Record<string, string> = {
    'Referrer-Policy': 'no-referrer',
    'User-Agent': 'RoninWallet/1.0.0'
  };
  
  // Añadir API key si está disponible
  const moralisApiKey = process.env.MORALIS_API_KEY;
  if (moralisApiKey) {
    headers['x-api-key'] = moralisApiKey;
  }
  
  // Ordenar endpoints por prioridad
  const endpoints: RpcEndpoint[] = [
    // Moralis con API key (primera opción)
    { url: process.env.RONIN_RPC_URL || '', apiKey: process.env.MORALIS_API_KEY, name: 'Moralis primario' },
    // Moralis secundario (segunda opción)
    { url: process.env.RONIN_RPC_URL_BACKUP || '', apiKey: process.env.MORALIS_API_KEY, name: 'Moralis secundario' },
    // Público como último recurso
    { url: 'https://api.roninchain.com/rpc', apiKey: undefined, name: 'RPC público' }
  ].filter(e => !!e.url); // Filtrar endpoints sin URL
  
  // Crear transportes para cada endpoint
  const transports = endpoints.map(endpoint => 
    http(endpoint.url, { 
      fetchOptions: { 
        headers: endpoint.apiKey ? { ...headers, 'x-api-key': endpoint.apiKey } : headers 
      } 
    })
  );
  
  // Crear public client con fallback
  const publicClient = createPublicClient({
    chain: ronin,
    transport: http(endpoints[0].url, {
      fetchOptions: {
        headers: endpoints[0].apiKey ? { ...headers, 'x-api-key': endpoints[0].apiKey } : headers
      }
    })
  });
  
  // Crear wallet client
  const walletClient = createWalletClient({
    chain: ronin,
    transport: http(endpoints[0].url, {
      fetchOptions: {
        headers: endpoints[0].apiKey ? { ...headers, 'x-api-key': endpoints[0].apiKey } : headers
      }
    }),
    account
  });
  
  return { publicClient, walletClient };
};

// Verificar balance del distribuidor
const checkDistributorBalance = async (publicClient: PublicClient): Promise<bigint> => {
  try {
    const balance = await publicClient.readContract({
      address: TOKEN_CONTRACT_ADDRESS as `0x${string}`,
      abi: FIRE_DUST_ABI,
      functionName: 'balanceOf',
      args: [DISTRIBUTOR_ADDRESS as `0x${string}`, BigInt(TOKEN_ID)]
    }) as bigint;
    
    return balance;
  } catch (error) {
    console.error('Error checking distributor balance:', error);
    throw error;
  }
};

// Verificar aprobación
const checkApproval = async (publicClient: PublicClient): Promise<boolean> => {
  try {
    const isApproved = await publicClient.readContract({
      address: TOKEN_CONTRACT_ADDRESS as `0x${string}`,
      abi: FIRE_DUST_ABI,
      functionName: 'isApprovedForAll',
      args: [DISTRIBUTOR_ADDRESS as `0x${string}`, DISTRIBUTOR_ADDRESS as `0x${string}`]
    }) as boolean;
    
    return isApproved;
  } catch (error) {
    console.error('Error checking approval:', error);
    throw error;
  }
};

// Aprobar transferencia
const approveTransfer = async (publicClient: PublicClient, walletClient: WalletClient) => {
  try {
    const { request } = await publicClient.simulateContract({
      address: TOKEN_CONTRACT_ADDRESS as `0x${string}`,
      abi: FIRE_DUST_ABI,
      functionName: 'setApprovalForAll',
      args: [DISTRIBUTOR_ADDRESS as `0x${string}`, true],
      account: walletClient.account
    });
    
    const hash = await walletClient.writeContract(request);
    
    // Esperar a que se confirme la transacción
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    return receipt;
  } catch (error) {
    console.error('Error approving transfer:', error);
    throw error;
  }
};

// Transferir tokens
const transferTokens = async (publicClient: PublicClient, walletClient: WalletClient, to: string, amount: number) => {
  try {
    const { request } = await publicClient.simulateContract({
      address: TOKEN_CONTRACT_ADDRESS as `0x${string}`,
      abi: FIRE_DUST_ABI,
      functionName: 'safeTransferFrom',
      args: [
        DISTRIBUTOR_ADDRESS as `0x${string}`,
        to as `0x${string}`,
        BigInt(TOKEN_ID),
        BigInt(amount),
        '0x' // Datos vacíos
      ],
      account: walletClient.account
    });
    
    const hash = await walletClient.writeContract(request);
    
    // Esperar a que se confirme la transacción
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    return { hash, receipt };
  } catch (error) {
    console.error('Error transferring tokens:', error);
    throw error;
  }
};

export async function POST(request: Request) {
  console.log('Iniciando proceso de reclamación de tokens (endpoint con viem)...');
  
  try {
    const supabase = await createClient();
    
    // Extraer datos del request
    const body = await request.json();
    const { walletAddress, amount } = body;
    
    console.log('Datos de la solicitud:', { walletAddress, amount });
    
    // Validaciones básicas
    if (!walletAddress || !isAddress(walletAddress)) {
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

    // Crear clientes viem
    try {
      const { publicClient, walletClient } = await createClients();
      
      // Verificar balance del distribuidor
      const distributorBalance = await checkDistributorBalance(publicClient);
      
      // Verificar si hay suficientes tokens
      if (distributorBalance < BigInt(amount)) {
        return NextResponse.json(
          { error: 'Tokens insuficientes en la wallet distribuidora' },
          { status: 400 }
        );
      }
      
      // Verificar aprobación
      const isApproved = await checkApproval(publicClient);
      
      // Aprobar si es necesario
      if (!isApproved) {
        console.log('El distribuidor necesita aprobación para transferir tokens...');
        await approveTransfer(publicClient, walletClient);
        
        // Esperar a que se confirme la aprobación
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Transferir tokens
      const { hash } = await transferTokens(publicClient, walletClient, walletAddress, amount);
      
      // Actualizar registros en la base de datos
      console.log('Actualizando registros en la base de datos...');
      
      // Registrar la transacción
      const { error: rewardError } = await supabase
        .from('rewards')
        .insert({
          user_id: userData.id,
          wallet_address: walletAddress.toLowerCase(),
          points_spent: Number(amount),
          tokens_received: amount,
          transaction_hash: hash
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
      
      console.log('Proceso de reclamación completado con éxito');
      return NextResponse.json({
        success: true,
        txHash: hash,
        tokens_received: amount,
        new_balance: newTotalPoints
      });
    } catch (error: any) {
      console.error('Error detallado en la transferencia:', error);
      
      // Implementar mecanismo de fallback - registrar en tabla de pending_rewards
      console.log('Implementando mecanismo de fallback debido a fallo en la transacción');
      
      try {
        // Registrar recompensa pendiente
        const { error: pendingError } = await supabase
          .from('pending_rewards')
          .insert({
            user_id: userData.id,
            wallet_address: walletAddress.toLowerCase(),
            amount: amount,
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
