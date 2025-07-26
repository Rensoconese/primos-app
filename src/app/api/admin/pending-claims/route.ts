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

export async function GET(request: Request) {
  try {
    // Verificar autorización del header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const walletAddress = authHeader.replace('Bearer ', '').toLowerCase();
    
    if (!AUTHORIZED_ADMINS.includes(walletAddress)) {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Obtener parámetros de query
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Construir query base
    let query = supabase
      .from('checkin_pending_rewards')
      .select(`
        *,
        users (
          wallet_address,
          total_points,
          current_streak
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filtrar por estado si se especifica
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error al obtener claims pendientes:', error);
      return NextResponse.json(
        { error: 'Error al obtener datos' },
        { status: 500 }
      );
    }

    // Obtener estadísticas
    const { data: stats } = await supabase
      .from('checkin_pending_rewards')
      .select('status')
      .then(result => {
        const statusCounts = result.data?.reduce((acc: any, row: any) => {
          acc[row.status] = (acc[row.status] || 0) + 1;
          return acc;
        }, {}) || {};

        return { data: statusCounts };
      });

    return NextResponse.json({
      claims: data || [],
      total: count || 0,
      stats: {
        pending: stats?.pending || 0,
        processing: stats?.processing || 0,
        completed: stats?.completed || 0,
        failed: stats?.failed || 0,
        cancelled: stats?.cancelled || 0
      },
      pagination: {
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0)
      }
    });

  } catch (error) {
    console.error('Error en API de claims pendientes:', error);
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    );
  }
}