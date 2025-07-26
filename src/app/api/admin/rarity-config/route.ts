import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Lista de wallets autorizadas (misma que en otros endpoints admin)
const AUTHORIZED_ADMINS = [
  '0xce6818326aa1db5641528d11f3121a7f84b53eff', // PRIMOS_WALLET
  '0xc1b977a826b75a87b5423bbe952104bcee885315', // MONSAI_WALLET
  '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF', // POOL_WALLET
  '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6', // RENSO_WALLET
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6', // ADMIN_WALLET
].map(addr => addr.toLowerCase());

// GET - Obtener configuración de rareza
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

    const supabase = await createClient();

    // Obtener configuración de rareza (token_id <= 0 son configuración)
    const { data, error } = await supabase
      .from('nft_points_mapping')
      .select('*')
      .lte('token_id', 0)
      .eq('active', true)
      .order('token_id', { ascending: false });

    if (error) {
      console.error('Error al obtener configuración:', error);
      return NextResponse.json(
        { error: 'Error al obtener datos' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      configs: data || [],
      total: data?.length || 0
    });

  } catch (error) {
    console.error('Error en GET rarity-config:', error);
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    );
  }
}

// POST - Actualizar configuración de rareza
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
    const { rarity_type, base_points } = body;

    // Validaciones
    if (!rarity_type || base_points === undefined) {
      return NextResponse.json(
        { error: 'rarity_type y base_points son requeridos' },
        { status: 400 }
      );
    }

    const validRarities = ['original', 'original_z', 'original_z_summer', 'shiny', 'shiny_z', 'shiny_z_summer', 'unique', 'full_set'];
    if (!validRarities.includes(rarity_type)) {
      return NextResponse.json(
        { error: 'rarity_type inválido' },
        { status: 400 }
      );
    }

    if (base_points < 0 || base_points > 100) {
      return NextResponse.json(
        { error: 'base_points debe estar entre 0 y 100' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Mapeo de rarity_type a token_id negativo
    const rarityToTokenId: Record<string, number> = {
      'original': 0,
      'original_z': -1,
      'original_z_summer': -2,
      'shiny': -3,
      'shiny_z': -4,
      'shiny_z_summer': -5,
      'unique': -6,
      'full_set': -7
    };

    const tokenId = rarityToTokenId[rarity_type];

    // Obtener valor anterior para auditoría
    const { data: oldData } = await supabase
      .from('nft_points_mapping')
      .select('base_points')
      .eq('token_id', tokenId)
      .single();

    // Actualizar configuración
    const { data, error } = await supabase
      .from('nft_points_mapping')
      .update({
        base_points,
        updated_by: adminWallet,
        updated_at: new Date().toISOString()
      })
      .eq('token_id', tokenId)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar configuración:', error);
      return NextResponse.json(
        { error: 'Error al actualizar' },
        { status: 500 }
      );
    }

    // Registrar en auditoría
    await supabase
      .from('admin_actions_log')
      .insert({
        admin_wallet: adminWallet,
        action_type: 'update_nft_mapping',
        target_id: `rarity_${rarity_type}`,
        old_value: oldData?.base_points?.toString(),
        new_value: base_points.toString(),
        reason: `Actualización de puntos para rareza ${rarity_type}`,
        metadata: {
          rarity_type,
          config_update: true
        }
      });

    return NextResponse.json({
      success: true,
      data,
      message: 'Configuración actualizada'
    });

  } catch (error) {
    console.error('Error en POST rarity-config:', error);
    return NextResponse.json(
      { error: 'Error del servidor' },
      { status: 500 }
    );
  }
}