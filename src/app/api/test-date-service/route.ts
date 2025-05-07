import { NextRequest, NextResponse } from 'next/server';
import { 
  normalizeToUTCMidnight, 
  isSameUTCDay, 
  getDayDifferenceUTC, 
  getSecondsUntilNextUTCMidnight,
  getUTCDebugInfo
} from '@/services/dateService';

export async function GET(req: NextRequest) {
  try {
    // Get the test date from the URL parameters (optional)
    const url = new URL(req.url);
    const testDateParam = url.searchParams.get('test_date');
    
    // Current date and time
    const now = new Date();
    
    // Test date (if provided)
    const testDate = testDateParam ? new Date(testDateParam) : new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to yesterday
    
    // Normalize dates to midnight UTC
    const nowUTC = normalizeToUTCMidnight(now);
    const testDateUTC = normalizeToUTCMidnight(testDate);
    
    // Check if same UTC day
    const isSameDay = isSameUTCDay(now, testDate);
    
    // Calculate day difference
    const dayDiff = getDayDifferenceUTC(now, testDate);
    
    // Calculate seconds until next UTC midnight
    const secondsUntilMidnight = getSecondsUntilNextUTCMidnight();
    
    // Calculate hours until next UTC midnight
    const hoursUntilMidnight = secondsUntilMidnight / 3600;
    
    // Get detailed UTC debug info
    const utcDebugInfo = getUTCDebugInfo('test-date-service', now);
    
    // Determine if check-in should be allowed based on UTC day
    const canCheckIn = !isSameDay;
    
    // Calculate hours since test date
    const hoursDiff = Math.abs(now.getTime() - testDate.getTime()) / (1000 * 3600);
    
    // Calculate hours remaining (if same day)
    const hoursRemaining = isSameDay ? Math.ceil(24 - hoursDiff) : 0;
    
    // Return all the calculated values
    return NextResponse.json({
      current_time: {
        local: now.toISOString(),
        utc_midnight: nowUTC.toISOString()
      },
      test_time: {
        local: testDate.toISOString(),
        utc_midnight: testDateUTC.toISOString()
      },
      comparison: {
        is_same_utc_day: isSameDay,
        day_difference: dayDiff,
        hours_difference: hoursDiff,
        hours_remaining: hoursRemaining
      },
      next_utc_midnight: {
        seconds_remaining: secondsUntilMidnight,
        hours_remaining: hoursUntilMidnight
      },
      check_in_status: {
        can_check_in: canCheckIn,
        reason: canCheckIn 
          ? "New UTC day detected" 
          : "Same UTC day, check-in already done or allowed"
      },
      utc_debug_info: utcDebugInfo
    });
  } catch (err) {
    console.error('Error in test-date-service:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
