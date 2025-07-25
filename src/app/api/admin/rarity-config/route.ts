import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = createClient();
    
    const { data: configs, error } = await supabase
      .from('nft_rarity_config')
      .select('rarity, points')
      .order('points', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      configs: configs || []
    });

  } catch (error: any) {
    console.error('Error fetching rarity configs:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { rarity, points } = await request.json();
    
    if (!rarity || typeof points !== 'number') {
      return NextResponse.json(
        { error: 'Rarity and points are required' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    
    const { error } = await supabase
      .from('nft_rarity_config')
      .upsert({
        rarity,
        points,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'rarity'
      });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Configuración actualizada: ${rarity} = ${points} puntos`
    });

  } catch (error: any) {
    console.error('Error updating rarity config:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}