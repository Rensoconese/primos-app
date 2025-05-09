import { NextRequest, NextResponse } from 'next/server';
import redisService from '@/services/redisService';

export async function GET(req: NextRequest) {
  try {
    // Importar las funciones de obtención de URL y token desde el servicio Redis
    // para asegurar que usamos la misma lógica
    const { getRedisUrl, getRedisToken } = redisService;
    
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
