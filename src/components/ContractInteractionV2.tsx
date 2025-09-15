'use client';

import { useState, useEffect, useRef } from 'react';
import { getSecondsUntilNextUTCMidnight, getUTCDebugInfo } from '@/services/dateService';

interface ContractInteractionV2Props {
  onCheckInSuccess?: () => void;
  userAddress?: string | null;
  walletClient?: any; // Mantenemos para compatibilidad pero no lo usamos
  publicClient?: any; // Mantenemos para compatibilidad pero no lo usamos
}

const ContractInteractionV2: React.FC<ContractInteractionV2Props> = ({ 
  onCheckInSuccess, 
  userAddress
}) => {
  const [streak, setStreak] = useState<number>(0);
  const [nextCheckInTime, setNextCheckInTime] = useState<string>('');
  const [streakBroken, setStreakBroken] = useState<boolean>(false);
  const [lastCheckIn, setLastCheckIn] = useState<string>('Never');
  const [hasCheckedIn, setHasCheckedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showAnimation, setShowAnimation] = useState<boolean>(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Auto-hide success message after 5 seconds
  useEffect(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    
    if (success) {
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
      }, 5000);
    }
    
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [success]);

  // Cargar status del usuario
  useEffect(() => {
    if (!userAddress) {
      setStatusLoading(false);
      return;
    }

    const fetchStatus = async () => {
      setStatusLoading(true);
      try {
        const response = await fetch(`/api/v2/status?wallet_address=${userAddress}`);
        const data = await response.json();

        if (!response.ok) {
          console.error('Error fetching v2 status:', data);
          return;
        }

        // Actualizar estado desde v2
        if (data.user) {
          setStreak(data.user.current_streak || 0);
          
          // Formatear última fecha de check-in
          if (data.user.last_checkin) {
            const lastCheckInDate = new Date(data.user.last_checkin + 'T00:00:00Z');
            const dateOptions: Intl.DateTimeFormatOptions = { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            };
            const dateStr = lastCheckInDate.toLocaleDateString('en-US', dateOptions);
            setLastCheckIn(dateStr);
          } else {
            setLastCheckIn('Never');
          }
        } else {
          // Usuario nuevo
          setStreak(0);
          setLastCheckIn('Never');
        }

        // Estado de check-in de hoy
        setHasCheckedIn(data.today.has_checked_in || false);

        // Verificar si se rompió la racha
        if (data.user && data.user.current_streak === 0 && data.user.last_checkin) {
          const lastDate = new Date(data.user.last_checkin + 'T00:00:00Z');
          const today = new Date();
          const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff > 1) {
            setStreakBroken(true);
          }
        }
      } catch (err) {
        console.error('Error loading v2 status:', err);
        setError('Failed to load user status');
      } finally {
        setStatusLoading(false);
      }
    };

    fetchStatus();
  }, [userAddress]);

  // Countdown to next check-in (based on UTC midnight)
  useEffect(() => {
    if (!hasCheckedIn) return;

    const calculateTimeLeft = () => {
      const now = new Date();
      const secondsUntilMidnight = getSecondsUntilNextUTCMidnight();
      
      const hours = Math.floor(secondsUntilMidnight / 3600);
      const minutes = Math.floor((secondsUntilMidnight % 3600) / 60);
      const seconds = Math.floor(secondsUntilMidnight % 60);
      
      if (hours === 0 && minutes <= 2) {
        console.log('DEBUG UTC Reset - Almost UTC midnight:', getUTCDebugInfo('ContractInteractionV2', now));
      }
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    setNextCheckInTime(calculateTimeLeft());
    
    const timer = setInterval(() => {
      setNextCheckInTime(calculateTimeLeft());
    }, 1000);
    
    return () => clearInterval(timer);
  }, [hasCheckedIn]);

  const handleCheckIn = async () => {
    if (!userAddress) {
      setError('Please connect your wallet first');
      return;
    }
    
    if (hasCheckedIn) {
      setError('You have already checked in today. Please try again tomorrow.');
      return;
    }
    
    setIsLoading(true);
    setShowAnimation(true);
    setError(null);
    setSuccess(null);
    
    try {
      
      // Llamar al endpoint v2 sin blockchain
      const response = await fetch('/api/v2/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: userAddress
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        if (result.alreadyCheckedIn) {
          setHasCheckedIn(true);
          setError('You have already checked in today.');
        } else {
          throw new Error(result.error || 'Failed to check in');
        }
        return;
      }
      
      // Actualizar UI con el resultado
      setStreak(result.user.current_streak);
      setHasCheckedIn(true);
      
      // Actualizar last check-in a hoy
      const today = new Date();
      const dateOptions: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      };
      const dateStr = today.toLocaleDateString('en-US', dateOptions);
      setLastCheckIn(dateStr);
      
      // Mensaje de éxito
      const multiplier = result.daily.streak_multiplier || 1.0;
      setSuccess(`Successfully checked in! Your streak is ${result.user.current_streak} days (${multiplier}x multiplier). You can now mine your rewards!`);
      
      // Llamar al callback si existe
      if (onCheckInSuccess) {
        onCheckInSuccess();
      }
      
    } catch (err: any) {
      setError(err.message || 'Failed to check in. Please try again.');
    } finally {
      setIsLoading(false);
      setShowAnimation(false);
    }
  };

  if (!userAddress) {
    return (
      <div className="p-6 bg-gray-100 rounded-lg shadow-md">
        <p className="text-center text-gray-600">Please connect your wallet to check in</p>
      </div>
    );
  }

  if (statusLoading) {
    return (
      <div className="p-6 bg-gray-800 rounded-lg shadow-md text-white">
        <div className="text-center">Loading check-in status...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-md text-white">
      <h2 className="text-2xl font-bold mb-4 uppercase">Daily Check-in (V2)</h2>
      
      {/* Two columns layout for Current Streak and Last Check-in */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Column 1: Current Streak */}
        <div className="bg-gray-700 p-4 rounded-md">
          <div className="flex items-start">
            <img 
              src="/images/streak.png" 
              alt="Streak" 
              className="h-14 w-14 mr-3" 
            />
            <div>
              <h3 className="font-bold text-lg text-white">Current Streak</h3>
              <p className="text-2xl font-bold text-white">{streak} days</p>
              {streak === 0 && streakBroken && (
                <p className="text-red-400 text-sm mt-1">
                  Your streak was broken! Check in daily to build it back up
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Last Check-in */}
        <div className="bg-gray-700 p-4 rounded-md">
          <div className="flex items-start">
            <img 
              src="/images/reloj_primos.png" 
              alt="Last Check-in" 
              className="h-14 w-14 mr-3" 
            />
            <div>
              <h3 className="font-bold text-lg text-white">Last Check-in</h3>
              <p className="text-lg text-white">{lastCheckIn}</p>
              {hasCheckedIn && (
                <p className="text-green-400 text-sm mt-1">
                  Next check-in available in: {nextCheckInTime}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Check-in Button */}
      <div className="mt-6 flex flex-col items-center">
        {!hasCheckedIn ? (
          <button
            ref={buttonRef}
            onClick={handleCheckIn}
            disabled={isLoading}
            className={`w-full px-6 py-3 rounded-lg font-bold text-lg transition-all duration-300 ${
              isLoading
                ? 'bg-blue-700 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Checking in...' : 'Check In Now'}
          </button>
        ) : (
          <div className="bg-green-800 text-green-100 p-3 rounded-lg text-center w-full">
            ✅ Already Checked In Today
          </div>
        )}
        
        {/* Show animation when checking in */}
        {showAnimation && (
          <div className="mt-4 relative w-full">
            <video autoPlay loop muted className="w-full max-w-full">
              <source src="/videos/bucle_o.webm" type="video/webm" />
              Your browser does not support the video tag.
            </video>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md w-full">
            {error}
          </div>
        )}
        
        {/* Success message */}
        {success && (
          <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md w-full">
            {success}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractInteractionV2;