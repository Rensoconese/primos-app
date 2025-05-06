import { startOfDay, addDays, differenceInSeconds, isSameDay, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// Zona horaria UTC
const UTC_TIMEZONE = 'UTC';

/**
 * Normaliza una fecha a medianoche UTC
 * @param date Fecha a normalizar
 * @returns Fecha normalizada a medianoche UTC
 */
export function normalizeToUTCMidnight(date: Date): Date {
  const utcDate = toZonedTime(date, UTC_TIMEZONE);
  return startOfDay(utcDate);
}

/**
 * Calcula el tiempo en segundos hasta la próxima medianoche UTC
 * @returns Segundos hasta la próxima medianoche UTC
 */
export function getSecondsUntilNextUTCMidnight(): number {
  const now = new Date();
  const utcNow = toZonedTime(now, UTC_TIMEZONE);
  const nextUTCMidnight = addDays(startOfDay(utcNow), 1);
  return differenceInSeconds(nextUTCMidnight, utcNow);
}

/**
 * Verifica si dos fechas corresponden al mismo día UTC
 * @param dateLeft Primera fecha
 * @param dateRight Segunda fecha
 * @returns true si ambas fechas corresponden al mismo día UTC
 */
export function isSameUTCDay(dateLeft: Date, dateRight: Date): boolean {
  const utcDateLeft = toZonedTime(dateLeft, UTC_TIMEZONE);
  const utcDateRight = toZonedTime(dateRight, UTC_TIMEZONE);
  return isSameDay(utcDateLeft, utcDateRight);
}

/**
 * Obtiene la fecha actual normalizada a medianoche UTC
 * @returns Fecha actual normalizada a medianoche UTC
 */
export function getCurrentUTCMidnight(): Date {
  return normalizeToUTCMidnight(new Date());
}

/**
 * Calcula la diferencia en días entre dos fechas en contexto UTC
 * @param dateLeft Primera fecha
 * @param dateRight Segunda fecha
 * @returns Número de días de diferencia
 */
export function getDayDifferenceUTC(dateLeft: Date, dateRight: Date): number {
  const utcDateLeft = normalizeToUTCMidnight(dateLeft);
  const utcDateRight = normalizeToUTCMidnight(dateRight);
  return Math.floor(Math.abs(utcDateLeft.getTime() - utcDateRight.getTime()) / (1000 * 3600 * 24));
}

/**
 * Formatea una fecha para logs de depuración
 * @param date Fecha a formatear
 * @returns Fecha formateada
 */
export function formatDateForDebug(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
}

/**
 * Genera un objeto con información de depuración sobre fechas UTC
 * @param label Etiqueta para el log
 * @param date Fecha a analizar
 * @returns Objeto con información de depuración
 */
export function getUTCDebugInfo(label: string, date: Date = new Date()): Record<string, any> {
  const utcMidnight = normalizeToUTCMidnight(date);
  const secondsUntilReset = getSecondsUntilNextUTCMidnight();
  
  return {
    label,
    currentTime: formatDateForDebug(date),
    utcMidnight: formatDateForDebug(utcMidnight),
    secondsUntilReset,
    hoursUntilReset: (secondsUntilReset / 3600).toFixed(2)
  };
}
