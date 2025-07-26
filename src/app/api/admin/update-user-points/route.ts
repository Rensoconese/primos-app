import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Lista de wallets autorizadas
const AUTHORIZED_ADMINS = [
  '0xce6818326aa1db5641528d11f3121a7f84b53eff', // PRIMOS_WALLET
  '0xc1b977a826b75a87b5423bbe952104bcee885315', // MONSAI_WALLET
  '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF', // POOL_WALLET
  '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6', // RENSO_WALLET
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6', // ADMIN_WALLET
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
    
    // Debug logging
    console.log('🔍 Admin wallet recibida:', adminWallet);
    console.log('📋 Lista de admins autorizados:', AUTHORIZED_ADMINS);
    console.log('✅ ¿Está autorizada?:', AUTHORIZED_ADMINS.includes(adminWallet));
    
    if (!AUTHORIZED_ADMINS.includes(adminWallet)) {
      return NextResponse.json(
        { error: `Acceso denegado para ${adminWallet}` },
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