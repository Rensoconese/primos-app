import { NextRequest, NextResponse } from 'next/server';
import redisService from '@/services/redisService';

export async function GET(req: NextRequest) {
  try {
    // Obtener URL y token de las variables de entorno para mostrar en la respuesta
    const getRedisUrl = () => {
      return process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL || 
             process.env.UPSTASH_REDIS_REST_URL || 
             process.env.NEXT_PUBLIC_KV_REST_API_URL ||
             process.env.KV_REST_API_URL || 
             '';
    };

    const getRedisToken = () => {
      return process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN || 
             process.env.UPSTASH_REDIS_REST_TOKEN || 
             process.env.NEXT_PUBLIC_KV_REST_API_TOKEN ||
             process.env.KV_REST_API_TOKEN || 
             '';
    };
    
    const url = getRedisUrl();
    const token = getRedisToken();
    
    // Verificar conexión
    const isConnected = await redisService.testConnection();
    
    if (!isConnected) {
      return NextResponse.json({ 
        success: false, 
        message: 'No se pudo conectar a Redis',
        env: {
          url: url ? 'Configurado' : 'No configurado',
          token: token ? 'Configurado' : 'No configurado'
        }
      }, { status: 500 });
    }
    
    // Calcular TTL hasta el próximo reset
    const ttl = redisService.getSecondsUntilNextUTCMidnight();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Conexión a Redis exitosa',
      nextResetIn: {
        seconds: ttl,
        minutes: Math.floor(ttl / 60),
        hours: Math.floor(ttl / 3600)
      }
    });
  } catch (error) {
    console.error('Error testing Redis:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Error al probar Redis',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
