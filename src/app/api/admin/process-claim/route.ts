import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { 
  createDirectPublicClient, 
  createDirectWalletClient, 
  getBlockNumberDirect, 
  callRpcDirectly,
  signAndSendTransaction
} from '@/utils/direct-rpc-viem';
import { 
  isAddress, 
  parseGwei, 
  encodeFunctionData, 
  type Address, 
  type Hash,
  type TransactionRequest
} from 'viem';
import { FIRE_DUST_ABI } from '@/utils/token-abi';

// Configuración
const TOKEN_CONTRACT_ADDRESS = '0xE3a334D6b7681D0151b81964CAf6353905e24B1b' as Address; // Fire Dust
const DISTRIBUTOR_ADDRESS = '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF' as Address; // Wallet pool
const DISTRIBUTOR_PRIVATE_KEY = process.env.REWARD_POOL_PRIVATE_KEY;
const TOKEN_ID = BigInt(4); // ID del token Fire Dust

// Lista de wallets autorizadas
const AUTHORIZED_ADMINS = [
  '0xce6818326aa1db5641528d11f3121a7f84b53eff', // PRIMOS_WALLET
  '0xc1b977a826b75a87b5423bbe952104bcee885315', // MONSAI_WALLET
  '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF', // POOL_WALLET
  '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6', // RENSO_WALLET
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6', // ADMIN_WALLET
].map(addr => addr.toLowerCase());

type RpcEndpoint = {
  url: string;
  apiKey?: string;
  name: string;
};

export async function POST(request: Request) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const adminWallet = authHeader.replace('Bearer ', '').toLowerCase();
    
    if (!AUTHORIZED_ADMINS.includes(adminWallet)) {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { claimId, adminNotes } = body;

    if (!claimId) {
      return NextResponse.json(
        { error: 'ID de claim requerido' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Obtener el claim pendiente
    const { data: claim, error: claimError } = await supabase
      .from('checkin_pending_rewards')
      .select('*, users(*)')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: 'Claim no encontrado' },
        { status: 404 }
      );
    }

    if (claim.status !== 'pending') {
      return NextResponse.json(
        { error: `Este claim ya está ${claim.status}` },
        { status: 400 }
      );
    }

    // Actualizar estado a processing
    await supabase
      .from('checkin_pending_rewards')
      .update({ 
        status: 'processing',
        admin_processed_by: adminWallet,
        admin_notes: adminNotes
      })
      .eq('id', claimId);

    // Verificar que la clave privada esté configurada
    if (!DISTRIBUTOR_PRIVATE_KEY) {
      await supabase
        .from('checkin_pending_rewards')
        .update({ 
          status: 'failed',
          error_details: 'Clave privada del distribuidor no configurada'
        })
        .eq('id', claimId);

      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    const privateKey = DISTRIBUTOR_PRIVATE_KEY.startsWith('0x') 
      ? DISTRIBUTOR_PRIVATE_KEY 
      : `0x${DISTRIBUTOR_PRIVATE_KEY}`;

    // Intentar procesar la transacción
    try {
      console.log('Procesando claim manual para:', claim.wallet_address);

      // Conectar con la blockchain
      const endpoints: RpcEndpoint[] = [
        { url: process.env.RONIN_RPC_URL || '', apiKey: process.env.MORALIS_API_KEY, name: 'Moralis primario' },
        { url: process.env.RONIN_RPC_URL_BACKUP || '', apiKey: process.env.MORALIS_API_KEY, name: 'Moralis secundario' },
        { url: 'https://api.roninchain.com/rpc', apiKey: undefined, name: 'RPC público' }
      ].filter(e => !!e.url);

      let connectedEndpoint: RpcEndpoint | null = null;
      
      for (const endpoint of endpoints) {
        try {
          const blockNumber = await getBlockNumberDirect(endpoint.url, endpoint.apiKey);
          console.log(`Conectado a ${endpoint.name}. Bloque: ${blockNumber}`);
          connectedEndpoint = endpoint;
          break;
        } catch (error) {
          console.error(`Error con ${endpoint.name}:`, error);
        }
      }

      if (!connectedEndpoint) {
        throw new Error('No se pudo conectar a ningún endpoint RPC');
      }

      const publicClient = await createDirectPublicClient(
        connectedEndpoint.url,
        connectedEndpoint.apiKey
      );
      
      const walletClient = await createDirectWalletClient(
        privateKey,
        connectedEndpoint.url,
        connectedEndpoint.apiKey
      );

      const tokenAmount = BigInt(claim.amount);

      // Verificar balance
      const balanceOfData = encodeFunctionData({
        abi: FIRE_DUST_ABI,
        functionName: 'balanceOf',
        args: [DISTRIBUTOR_ADDRESS, TOKEN_ID]
      });
      
      const result = await callRpcDirectly(
        connectedEndpoint.url,
        'eth_call',
        [{
          to: TOKEN_CONTRACT_ADDRESS,
          data: balanceOfData
        }, 'latest'],
        connectedEndpoint.apiKey
      );
      
      const distributorBalance = BigInt(result);
      
      if (distributorBalance < tokenAmount) {
        throw new Error('Tokens insuficientes en la wallet distribuidora');
      }

      // Preparar y enviar transacción
      const transferData = encodeFunctionData({
        abi: FIRE_DUST_ABI,
        functionName: 'safeTransferFrom',
        args: [
          DISTRIBUTOR_ADDRESS, 
          claim.wallet_address as Address, 
          TOKEN_ID, 
          tokenAmount, 
          "0x"
        ]
      });
      
      const txCount = await callRpcDirectly(
        connectedEndpoint.url,
        'eth_getTransactionCount',
        [DISTRIBUTOR_ADDRESS, 'latest'],
        connectedEndpoint.apiKey
      );
      
      const txParams: TransactionRequest = {
        to: TOKEN_CONTRACT_ADDRESS,
        nonce: parseInt(txCount, 16),
        gasPrice: parseGwei('30'),
        gas: BigInt(200000),
        data: transferData
      };
      
      const txHash = await signAndSendTransaction(
        walletClient,
        publicClient,
        txParams
      );

      console.log('Transacción enviada:', txHash);

      // Esperar confirmación
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      if (receipt.status === 'success') {
        // Actualizar estado a completado
        await supabase
          .from('checkin_pending_rewards')
          .update({ 
            status: 'completed',
            transaction_hash: txHash,
            processed_at: new Date().toISOString()
          })
          .eq('id', claimId);

        // Registrar en rewards
        await supabase
          .from('rewards')
          .insert({
            user_id: claim.user_id,
            wallet_address: claim.wallet_address,
            points_spent: Number(claim.points_to_deduct),
            tokens_received: Number(claim.amount),
            transaction_hash: txHash
          });

        // Actualizar puntos del usuario
        const newPoints = claim.users.total_points - claim.points_to_deduct;
        await supabase
          .from('users')
          .update({ total_points: newPoints })
          .eq('id', claim.user_id);

        // Actualizar leaderboard
        const { updateLeaderboard } = await import('@/services/leaderboardService');
        await updateLeaderboard(claim.wallet_address, {
          tokens_claimed: Number(claim.amount),
          points_earned: newPoints,
          last_active: new Date().toISOString()
        });

        return NextResponse.json({
          success: true,
          txHash,
          message: 'Claim procesado exitosamente'
        });
      } else {
        throw new Error('La transacción falló');
      }

    } catch (error: any) {
      console.error('Error procesando claim:', error);
      
      // Actualizar estado a failed
      await supabase
        .from('checkin_pending_rewards')
        .update({ 
          status: 'failed',
          error_details: error.message || 'Error desconocido en procesamiento manual'
        })
        .eq('id', claimId);

      return NextResponse.json(
        { error: error.message || 'Error al procesar claim' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error en process-claim:', error);
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    );
  }
}