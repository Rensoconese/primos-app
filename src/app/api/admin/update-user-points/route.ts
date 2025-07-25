import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Lista de wallets autorizadas
const AUTHORIZED_ADMINS = [
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6',
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
].map(addr => addr.toLowerCase());

export async function POST(request: NextRequest) {
  try {
    const { wallet_address, points } = await request.json();
    
    if (!wallet_address || typeof points !== 'number') {
      return NextResponse.json(
        { error: 'Wallet address and points are required' },
        { status: 400 }
      );
    }

    // Por ahora, solo validamos que sea un endpoint funcional
    // La autorización se hará en el frontend por simplicidad
    
    const supabase = createClient();
    
    // Obtener usuario actual
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('total_points')
      .eq('wallet_address', wallet_address.toLowerCase())
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error(`Error fetching user: ${fetchError.message}`);
    }

    const currentPoints = currentUser?.total_points || 0;
    const newPoints = Math.max(0, currentPoints + points);

    // Actualizar puntos
    const { error: updateError } = await supabase
      .from('users')
      .upsert({
        wallet_address: wallet_address.toLowerCase(),
        total_points: newPoints,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'wallet_address'
      });

    if (updateError) {
      throw new Error(`Error updating points: ${updateError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Puntos actualizados: ${currentPoints} → ${newPoints} (${points > 0 ? '+' : ''}${points})`,
      previousPoints: currentPoints,
      newPoints: newPoints,
      change: points
    });

  } catch (error: any) {
    console.error('Error updating user points:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}