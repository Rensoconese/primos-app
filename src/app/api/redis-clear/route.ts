import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getRedisUrl, getRedisToken } from '@/services/redisService';

export async function POST(req: NextRequest) {
  try {
    // Inicializar cliente Redis
    const redis = new Redis({
      url: getRedisUrl(),
      token: getRedisToken(),
    });
    
    // Obtener todas las claves que coinciden con el patrón de NFTs bloqueados
    const keys = await redis.keys('nft:locked:*');
    
    if (keys.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No hay NFTs bloqueados para limpiar',
        keysDeleted: 0
      });
    }
    
    // Eliminar todas las claves encontradas
    let deletedCount = 0;
    for (const key of keys) {
      const result = await redis.del(key);
      if (result === 1) {
        deletedCount++;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Se han limpiado ${deletedCount} NFTs bloqueados`,
      keysDeleted: deletedCount,
      totalKeys: keys.length
    });
  } catch (error) {
    console.error('Error limpiando Redis:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Error limpiando Redis',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
