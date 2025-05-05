import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function GET(req: NextRequest) {
  try {
    // Obtener URL y token de las variables de entorno
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
    
    // Verificar si las variables de entorno están configuradas
    if (!url || !token) {
      return NextResponse.json({ 
        success: false, 
        message: 'Variables de entorno de Redis no configuradas',
        env: {
          url: url ? 'Configurado' : 'No configurado',
          token: token ? 'Configurado' : 'No configurado'
        }
      }, { status: 500 });
    }
    
    // Inicializar cliente Redis directamente
    const redis = new Redis({
      url,
      token
    });
    
    // Probar conexión
    try {
      await redis.ping();
      
      // Calcular TTL hasta el próximo reset
      const now = new Date();
      const tomorrow = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      
      const ttl = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Conexión a Redis exitosa (sin dependencia de Supabase)',
        nextResetIn: {
          seconds: ttl,
          minutes: Math.floor(ttl / 60),
          hours: Math.floor(ttl / 3600)
        }
      });
    } catch (redisError) {
      console.error('Error conectando a Redis:', redisError);
      return NextResponse.json({ 
        success: false, 
        message: 'Error conectando a Redis',
        error: redisError instanceof Error ? redisError.message : String(redisError)
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error general:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Error general al probar Redis',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
