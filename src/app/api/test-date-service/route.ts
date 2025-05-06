import { NextRequest, NextResponse } from 'next/server';
import { 
  normalizeToUTCMidnight, 
  getSecondsUntilNextUTCMidnight, 
  isSameUTCDay, 
  getDayDifferenceUTC, 
  formatDateForDebug,
  getUTCDebugInfo
} from '@/services/dateService';

export async function GET(req: NextRequest) {
  try {
    // Obtener fecha de prueba de los parámetros de consulta (opcional)
    const url = new URL(req.url);
    const testDateParam = url.searchParams.get('date');
    const compareWithParam = url.searchParams.get('compare_with');
    
    // Fecha actual
    const now = new Date();
    
    // Fecha de prueba (si se proporciona)
    const testDate = testDateParam ? new Date(testDateParam) : now;
    
    // Fecha de comparación (si se proporciona)
    const compareWithDate = compareWithParam ? new Date(compareWithParam) : new Date(now.getTime() - 24 * 60 * 60 * 1000); // Por defecto, ayer
    
    // Normalizar fechas a medianoche UTC
    const nowUTC = normalizeToUTCMidnight(now);
    const testDateUTC = normalizeToUTCMidnight(testDate);
    const compareWithUTC = normalizeToUTCMidnight(compareWithDate);
    
    // Calcular segundos hasta la próxima medianoche UTC
    const secondsUntilMidnight = getSecondsUntilNextUTCMidnight();
    
    // Verificar si las fechas corresponden al mismo día UTC
    const isSameDay = isSameUTCDay(testDate, compareWithDate);
    
    // Calcular diferencia en días
    const dayDifference = getDayDifferenceUTC(testDate, compareWithDate);
    
    // Información de depuración
    const debugInfo = getUTCDebugInfo('Test Date Service', now);
    
    // Construir respuesta
    const response = {
      current_time: {
        local: now.toISOString(),
        utc_midnight: nowUTC.toISOString(),
        formatted: formatDateForDebug(now)
      },
      test_date: {
        input: testDate.toISOString(),
        utc_midnight: testDateUTC.toISOString(),
        formatted: formatDateForDebug(testDate)
      },
      compare_with: {
        input: compareWithDate.toISOString(),
        utc_midnight: compareWithUTC.toISOString(),
        formatted: formatDateForDebug(compareWithDate)
      },
      comparison: {
        is_same_utc_day: isSameDay,
        day_difference: dayDifference
      },
      next_utc_midnight: {
        seconds_until: secondsUntilMidnight,
        minutes_until: Math.floor(secondsUntilMidnight / 60),
        hours_until: Math.floor(secondsUntilMidnight / 3600)
      },
      debug_info: debugInfo
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in test-date-service:', error);
    return NextResponse.json(
      { 
        error: 'Error processing date service test',
        message: error instanceof Error ? error.message : String(error)
      }, 
      { status: 500 }
    );
  }
}
