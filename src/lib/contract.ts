import { 
  createPublicClient, 
  createWalletClient,
  http,
  type Address,
  encodeFunctionData,
  type Account
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ronin } from '@/utils/chain';
import { FIRE_DUST_ABI } from '@/utils/token-abi';

// Configuración
const TOKEN_CONTRACT_ADDRESS = '0xE3a334D6b7681D0151b81964CAf6353905e24B1b' as Address; // Fire Dust
const POOL_WALLET_ADDRESS = '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF' as Address; // Wallet pool
const TOKEN_ID = BigInt(4); // ID del token Fire Dust

/**
 * Transfiere tokens Fire Dust desde el pool wallet
 */
export async function transferTokensFromPool(
  recipientAddress: string,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log(`Transferring ${amount} Fire Dust tokens to ${recipientAddress}`);
    
    // Obtener la clave privada del pool (usar el nombre correcto de la variable)
    const POOL_PRIVATE_KEY = process.env.REWARD_POOL_PRIVATE_KEY;
    
    if (!POOL_PRIVATE_KEY) {
      console.error('❌ REWARD_POOL_PRIVATE_KEY environment variable is not set');
      throw new Error('Pool wallet private key not configured. Please set REWARD_POOL_PRIVATE_KEY environment variable.');
    }
    
    console.log('Pool wallet configured:', POOL_WALLET_ADDRESS);
    
    const privateKey = POOL_PRIVATE_KEY.startsWith('0x') 
      ? POOL_PRIVATE_KEY as `0x${string}`
      : `0x${POOL_PRIVATE_KEY}` as `0x${string}`;
    
    // Crear account desde la clave privada
    const account = privateKeyToAccount(privateKey);
    
    // Crear cliente público
    const publicClient = createPublicClient({
      chain: ronin,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://api.roninchain.com/rpc')
    });
    
    // Crear cliente wallet
    const walletClient = createWalletClient({
      account,
      chain: ronin,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://api.roninchain.com/rpc')
    });
    
    // Verificar balance del pool
    const poolBalance = await publicClient.readContract({
      address: TOKEN_CONTRACT_ADDRESS,
      abi: FIRE_DUST_ABI,
      functionName: 'balanceOf',
      args: [POOL_WALLET_ADDRESS, TOKEN_ID]
    }) as bigint;
    
    console.log(`Pool balance: ${poolBalance.toString()}`);
    
    const tokenAmount = BigInt(amount);
    
    if (poolBalance < tokenAmount) {
      throw new Error(`Insufficient balance in pool. Has ${poolBalance}, needs ${tokenAmount}`);
    }
    
    // Preparar la transferencia ERC1155
    const { request } = await publicClient.simulateContract({
      account,
      address: TOKEN_CONTRACT_ADDRESS,
      abi: FIRE_DUST_ABI,
      functionName: 'safeTransferFrom',
      args: [
        POOL_WALLET_ADDRESS, // from
        recipientAddress as Address, // to
        TOKEN_ID, // token ID
        tokenAmount, // amount
        '0x' as `0x${string}` // data
      ]
    });
    
    // Ejecutar la transferencia
    const txHash = await walletClient.writeContract(request);
    
    console.log(`Transaction sent: ${txHash}`);
    
    // Esperar confirmación
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000 // 60 segundos timeout
    });
    
    if (receipt.status === 'success') {
      console.log(`✅ Transfer successful: ${txHash}`);
      return { success: true, txHash };
    } else {
      throw new Error('Transaction failed');
    }
    
  } catch (error: any) {
    console.error('Transfer error:', error);
    return {
      success: false,
      error: error.message || 'Failed to transfer tokens'
    };
  }
}