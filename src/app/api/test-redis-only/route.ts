import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function GET(req: NextRequest) {
  try {
    // Función para extraer URL y token de una URL completa (como REDIS_URL o KV_URL)
    const extractCredentialsFromUrl = (url: string): { url: string; token: string } | null => {
      if (!url) return null;
      
      try {
        // Formato típico: rediss://default:TOKEN@hostname:port
        const match = url.match(/rediss:\/\/default:([^@]+)@([^:]+):(\d+)/);
        if (match) {
          const token = match[1];
          const hostname = match[2];
          
          // Retorna formato compatible con Upstash REST API
          return {
            url: `https://${hostname}`,
            token: token
          };
        }
      } catch (e) {
        console.error("Error parsing Redis URL:", e);
      }
      
      return null;
    };

    // Función para obtener la URL de Redis
    const getRedisUrl = () => {
      // Primero intenta obtener URL directamente de las variables estándar
      const directUrl = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL || 
                       process.env.UPSTASH_REDIS_REST_URL || 
                       process.env.NEXT_PUBLIC_KV_REST_API_URL ||
                       process.env.KV_REST_API_URL;
      
      if (directUrl) return directUrl;
      
      // Si no hay URL directa, intenta extraer de las URLs completas
      const redisUrl = process.env.REDIS_URL;
      const kvUrl = process.env.KV_URL;
      
      if (redisUrl) {
        const credentials = extractCredentialsFromUrl(redisUrl);
        if (credentials) return credentials.url;
      }
      
      if (kvUrl) {
        const credentials = extractCredentialsFromUrl(kvUrl);
        if (credentials) return credentials.url;
      }
      
      return '';
    };

    // Función para obtener el token de Redis
    const getRedisToken = () => {
      // Primero intenta obtener token directamente de las variables estándar
      const directToken = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN || 
                         process.env.UPSTASH_REDIS_REST_TOKEN || 
                         process.env.NEXT_PUBLIC_KV_REST_API_TOKEN ||
                         process.env.KV_REST_API_TOKEN;
      
      if (directToken) return directToken;
      
      // Si no hay token directo, intenta extraer de las URLs completas
      const redisUrl = process.env.REDIS_URL;
      const kvUrl = process.env.KV_URL;
      
      if (redisUrl) {
        const credentials = extractCredentialsFromUrl(redisUrl);
        if (credentials) return credentials.token;
      }
      
      if (kvUrl) {
        const credentials = extractCredentialsFromUrl(kvUrl);
        if (credentials) return credentials.token;
      }
      
      return '';
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
