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
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6', // Tu wallet
  '0xfC5B6724c8AD723964A94E68fCD0Df3485ED9d61',
  '0x5B8C49b96C30FbC4CB96Ddf7D09BA99d96CB4a44',
  '0xD4B1E88a666452e8473151E51D3eaBA8Fda44A31',
  '0x7a1d960b88C088c8f577c5dcee88E670E57A9530',
  '0x90D69dF93B2fCaac890Bf0CdCd52Ca16fE951B48',
  '0x1f9fB4B8eb7a7d996B6f4A2a859f2f8cBe6c9dD1',
  '0xb1ae7BC6949E32A0F652F8872B3Aa37aF7ca7E2f',
  '0xA1DF982FcA99bEda0Aa067D3A44fcb3e016A2080',
  '0xAB5a3D4E5Fc5A085FA5DDa9bbf86ef13a57Aa2d7',
  '0x97a42b1Ef7C1dE9bDe7B8F951EDa37a08B0dB8ce',
  '0x7f7d1CB59dDaB3b9B52E5b3D1CE826dA3c0B2C07',
  '0xEc92Ed45072a4Ad5B5b3F039a4Be949d0937c381',
  '0xEa0a0D3Bec99784dF3b95411dE963F5C755FFf33',
  '0x61da36b4Eac7ce7CB2B5A91fa4D5B4A685E07bBD',
  '0x6C93a18C96DdcE993E088C4f59B6D6AAa45d5faf',
  '0xd80b39eB0db7F8b039C5BD686eC6D0c87C6aF1dd',
  '0xCe4e00c69c88Fb2A42D52e7F327eF97e0A0A77C5',
  '0xef1Ac8b214AC5C0B5a91002F82F690a6CaAcb4Eb',
  '0x9D1F2dd085b5dD411F12De1b06e5cb83eDFA65ec',
  '0xeCE5CBA12F3f518085A2E5575f3A95196ec7eCb5',
  '0x23ABBe8e821F45E1d6E5f5dF016Ce33DAb3E7F33',
  '0xd8B934580fcE35a11B58C6D73aDeE468a2833fa8',
  '0xac5e1Ea73d81F0e2d5e688c88bc96b90fC8FA25e',
  '0xA59E77dD060D08Cd5862440d079fAaEB2e9b7b78',
  '0x3A34d58848Cc1Cf2151FC757c5dEc96c0d4BCaB4',
  '0x24B0322b0D2E0e37A8CaB5Ba016E8c0d96Df6a05',
  '0x0c66CE5d0539eF0E2f88c4dDb4F9B65b9E3c273C',
  '0xE96A4E0fD67CB52ab6B079a15f5a8eDaE16Ee06b',
  '0x60C80F3B837c2D06e8B9a7Af4a7E3c21dd99d2cb',
  '0x48b86DB72e3fBb60E8d5F1AECb18381Da8E1aCD9',
  '0x37e3f3c4A0Ee3E08BC92c80e4d12aCd27Ca8923A',
  '0x8b0Ef7F2ab96a51ff00c1ca92d859a4065ea3E95',
  '0x31fCbAE2F646ee067f1D4f88Cb891bDB03eBCf4e'
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