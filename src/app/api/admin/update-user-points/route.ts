import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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

// GET - Obtener datos de un usuario
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address requerida' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Obtener datos del usuario
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        *,
        check_ins (count),
        rewards (
          tokens_received,
          created_at
        )
      `)
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Calcular total de tokens reclamados
    const totalTokensClaimed = user.rewards?.reduce((sum: number, reward: any) => 
      sum + (reward.tokens_received || 0), 0) || 0;

    return NextResponse.json({
      wallet_address: user.wallet_address,
      total_points: user.total_points,
      current_streak: user.current_streak,
      max_streak: user.max_streak,
      total_check_ins: user.total_check_ins,
      last_check_in: user.last_check_in,
      created_at: user.created_at,
      total_tokens_claimed: totalTokensClaimed,
      rewards_history: user.rewards || []
    });

  } catch (error) {
    console.error('Error en GET user points:', error);
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    );
  }
}

// POST - Actualizar puntos de un usuario
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
    const { walletAddress, newPoints, reason } = body;

    if (!walletAddress || newPoints === undefined || newPoints === null) {
      return NextResponse.json(
        { error: 'Wallet address y newPoints son requeridos' },
        { status: 400 }
      );
    }

    if (newPoints < 0) {
      return NextResponse.json(
        { error: 'Los puntos no pueden ser negativos' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Obtener usuario actual
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, total_points')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const oldPoints = user.total_points;

    // Actualizar puntos
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        total_points: newPoints,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Error al actualizar puntos' },
        { status: 500 }
      );
    }

    // Registrar en tabla de auditoría (crear si no existe)
    await supabase
      .from('admin_actions_log')
      .insert({
        admin_wallet: adminWallet,
        action_type: 'update_points',
        target_wallet: walletAddress.toLowerCase(),
        old_value: oldPoints.toString(),
        new_value: newPoints.toString(),
        reason: reason || 'Ajuste manual de puntos',
        created_at: new Date().toISOString()
      });

    // Actualizar leaderboard
    const { updateLeaderboard } = await import('@/services/leaderboardService');
    await updateLeaderboard(walletAddress, {
      points_earned: newPoints,
      last_active: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: 'Puntos actualizados exitosamente',
      oldPoints,
      newPoints,
      updatedBy: adminWallet
    });

  } catch (error) {
    console.error('Error en POST update points:', error);
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    );
  }
}