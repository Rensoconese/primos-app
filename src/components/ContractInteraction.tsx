'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  getViemContract,
  retry, 
  safeNumberFromBigInt, 
  safeStringFromBigInt, 
  directContractCall, 
  RONIN_CHAIN_IDS
} from '@/utils/contract';
import { 
  createWalletClient, 
  createPublicClient,
  custom, 
  type Address,
  type WalletClient,
  type PublicClient
} from 'viem';
import { ronin } from '@/utils/chain';
import { getSecondsUntilNextUTCMidnight, formatDateForDebug, getUTCDebugInfo } from '@/services/dateService';
import { updateLeaderboardStreak } from '@/services/leaderboardService';
import { useUserData, useInvalidateUserData } from '@/hooks/useUserData';

interface ContractInteractionProps {
  onCheckInSuccess?: () => void;
  userAddress?: string | null;
  nftCalculationInProgress?: boolean;
  refreshTrigger?: number; // New prop to trigger updates
  walletClient?: WalletClient | null;
  publicClient?: PublicClient | null;
}

const ContractInteraction: React.FC<ContractInteractionProps> = ({ 
  walletClient: externalWalletClient, 
  publicClient: externalPublicClient, 
  onCheckInSuccess, 
  userAddress: externalUserAddress, 
  nftCalculationInProgress, 
  refreshTrigger 
}) => {
  const [streak, setStreak] = useState<number>(0);
  const [nextCheckInTime, setNextCheckInTime] = useState<string>('');
  const [streakBroken, setStreakBroken] = useState<boolean>(false);
  const [contractOwner, setContractOwner] = useState<string | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<string>('Never');
  const [hasCheckedIn, setHasCheckedIn] = useState<boolean>(false);
  const [checkInCount, setCheckInCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide success message after 5 seconds
  useEffect(() => {
    // Clear any existing timer when success changes
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    
    // If we have a success message, set a timer to clear it
    if (success) {
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
      }, 5000); // 5 seconds
    }
    
    // Cleanup function to clear timer on unmount
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [success]);
  
  const [userAddress, setUserAddress] = useState<string | null>(externalUserAddress || null);
  const [networkInfo, setNetworkInfo] = useState<{ chainId: number; networkName: string } | null>(null);
  const [showAnimation, setShowAnimation] = useState<boolean>(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Referencia para el cliente viem
  const [walletClient, setWalletClient] = useState<WalletClient | null>(externalWalletClient || null);
  const [publicClient, setPublicClient] = useState<PublicClient | null>(externalPublicClient || null);
  
  // Usar el hook de TanStack Query para obtener datos del usuario
  const { data: userDataResponse, isLoading: userDataLoading, error: userDataError } = useUserData(userAddress);
  const invalidateUserData = useInvalidateUserData();

  // Function to get network name from chain ID
  const getNetworkName = (chainId: number): string => {
    switch (chainId) {
      case RONIN_CHAIN_IDS.MAINNET:
        return 'Ronin Mainnet';
      case RONIN_CHAIN_IDS.TESTNET:
        return 'Ronin Saigon Testnet';
      default:
        return `Unknown Network (Chain ID: ${chainId})`;
    }
  };

  // Function to reset the UI state
  const resetState = () => {
    setContractOwner(null);
    setLastCheckIn('Never');
    setHasCheckedIn(false);
    setCheckInCount(0);
    setError(null);
    setSuccess(null);
    setNetworkInfo(null);
  };

  // Actualizar userAddress cuando cambia externalUserAddress
  useEffect(() => {
    if (externalUserAddress) {
      setUserAddress(externalUserAddress);
    }
  }, [externalUserAddress]);

  // Actualizar walletClient y publicClient cuando cambian los externos
  useEffect(() => {
    if (externalWalletClient) {
      setWalletClient(externalWalletClient);
    }
    if (externalPublicClient) {
      setPublicClient(externalPublicClient);
    }
  }, [externalWalletClient, externalPublicClient]);

  // Actualizar streak cuando cambian los datos del usuario
  useEffect(() => {
    if (userDataResponse?.data) {
      setStreak(userDataResponse.data.current_streak || 0);
      setStreakBroken(userDataResponse.data.streak_broken || false);
    } else if (!userDataLoading && !userDataError) {
      // User not found, initialize streak to 0
      setStreak(0);
    }
  }, [userDataResponse, userDataLoading, userDataError]);
  
  // Refresh data when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && userAddress) {
      invalidateUserData(userAddress);
    }
  }, [refreshTrigger, userAddress]); // Remover invalidateUserData de dependencies

  // Cargar datos del contrato cuando cambia el cliente público
  useEffect(() => {
    // Flag to prevent state updates if the component unmounts
    let isMounted = true;
    
    // Reset all state when client changes
    resetState();
    
    const fetchContractData = async () => {
      if (!publicClient || !userAddress) {
        console.error("Public client or user address is not available");
        return;
      }
      
      console.log("Fetching data for wallet:", userAddress);
      
      try {
        // Obtener información de la red
        const chainId = publicClient.chain?.id;
        if (chainId && isMounted) {
          setNetworkInfo({
            chainId,
            networkName: getNetworkName(chainId)
          });
        }
        
        // Obtener el contrato
        const contract = await getViemContract(publicClient, userAddress as Address);
        
        // Add a delay before making contract calls to avoid network congestion
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // We'll try each contract call separately and continue even if some fail
        let hasError = false;
        
        try {
          // Get contract owner with retry
          const owner = await retry(async () => {
            return await publicClient.readContract({
              address: contract.address as Address,
              abi: contract.abi,
              functionName: 'owner'
            });
          });
          if (isMounted) setContractOwner(owner as string);
        } catch (ownerErr: any) {
          console.error('Error getting contract owner:', ownerErr);
          hasError = true;
        }
        
        // Add another small delay between calls
        await new Promise(resolve => setTimeout(resolve, 300));
        
        try {
          // Los datos del usuario ya vienen del hook useUserData
          if (userDataResponse?.data) {
            // Check if streak is broken during initial load
            // Only show streak broken message if streak is still 0
            if (userDataResponse.data.streak_broken && userDataResponse.data.current_streak === 0) {
              console.log("Streak broken detected during initial load");
              // Update URL to trigger streak broken notification in NFTDisplay
              const url = new URL(window.location.href);
              url.searchParams.set('check_in', 'true');
              url.searchParams.set('streak_broken', 'true');
              window.history.pushState({}, '', url.toString());
              
              // Set streakBroken state
              if (isMounted) setStreakBroken(true);
            } else if (userDataResponse.data.current_streak > 0) {
              // If streak is positive, clear the streakBroken flag
              if (isMounted) setStreakBroken(false);
            }
            
            // Log the can_checkin value for debugging
            console.log("Can check-in value from API:", userDataResponse.data.can_checkin);
            console.log("Hours remaining:", userDataResponse.data.hours_remaining);
            console.log("Checked in today UTC:", userDataResponse.data.checked_in_today_utc);
            
            if (userDataResponse.data.checked_in_today_utc === true) {
              console.log("Usuario ya hizo check-in hoy (UTC) según la base de datos");
              if (isMounted) setHasCheckedIn(true);
            } else if (!userDataResponse.data.can_checkin) {
              // Use can_checkin property from API instead of hours_since_last_checkin
              console.log(`Debe esperar ${userDataResponse.data.hours_remaining} horas más para hacer check-in`);
              if (isMounted) {
                  setError(`You must wait ${userDataResponse.data.hours_remaining} hours before checking in again`);
                }
              } else {
                // Clear any error if the user can check in
                if (isMounted) setError(null);
              }
              
              if (userDataResponse.data.last_check_in) {
                const lastCheckInDate = new Date(userDataResponse.data.last_check_in);
                
                // Format the date in Spanish style
                const dateOptions: Intl.DateTimeFormatOptions = { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                };
                const timeOptions: Intl.DateTimeFormatOptions = {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                };
                
                const dateStr = lastCheckInDate.toLocaleDateString('en-US', dateOptions);
                const timeStr = lastCheckInDate.toLocaleTimeString('en-US', timeOptions);
                setLastCheckIn(`${dateStr}\n${timeStr}`);
              } else {
                setLastCheckIn('Never');
              }
            } else {
              setLastCheckIn('Never');
            }
        } catch (apiErr) {
          console.error('Error al obtener datos de usuario desde API:', apiErr);
          
          // Si falla la API, intentamos obtener del contrato como fallback
          let lastCheckInTime;
          try {
              lastCheckInTime = await retry(async () => {
                return await publicClient.readContract({
                  address: contract.address as Address,
                  abi: contract.abi,
                  functionName: 'getLastUpdatedPeriod',
                  args: [userAddress as Address]
                });
              });
            } catch (innerErr) {
              console.error('Error calling getLastCheckIn, trying alternative approach:', innerErr);
              // Fallback to 0 if the call fails
              lastCheckInTime = BigInt(0);
            }
            
            if (isMounted) {
              // Verificar si lastCheckInTime tiene un valor positivo
              const hasValue = lastCheckInTime !== null && 
                               (typeof lastCheckInTime === 'bigint' ? 
                                lastCheckInTime > BigInt(0) : false);
              
              if (hasValue) {
                // Get the current date as we need to display a proper date
                const now = new Date();
                // Format the date in Spanish style (day de month de year)
                const dateOptions: Intl.DateTimeFormatOptions = { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                };
                const timeOptions: Intl.DateTimeFormatOptions = {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                };
                // Combine date and time
                const dateStr = now.toLocaleDateString('en-US', dateOptions);
                const timeStr = now.toLocaleTimeString('en-US', timeOptions);
                setLastCheckIn(`${dateStr}\n${timeStr}`);
              } else {
                setLastCheckIn('Never');
              }
            }
        }
        
        // Add another small delay between calls
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Try to get check-in status directly from contract first
        try {
          const checkedIn = await retry(async () => {
            return await publicClient.readContract({
              address: contract.address as Address,
              abi: contract.abi,
              functionName: 'isCheckedInToday',
              args: [userAddress as Address]
            });
          });
          if (isMounted) setHasCheckedIn(Boolean(checkedIn));
        } catch (checkedInErr) {
          console.error('Error calling hasCheckedIn directly, falling back to date comparison:', checkedInErr);
          
          // Fallback: Since calling hasCheckedIn directly is unreliable, we'll determine checked-in status from last check-in time
          // Get the current date
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          // If lastCheckIn is not 'Never', parse it to get the date
          if (lastCheckIn !== 'Never') {
            try {
              const lastCheckInDate = new Date(lastCheckIn);
              lastCheckInDate.setHours(0, 0, 0, 0);
              
              // Check if the last check-in was today
              const checkedInToday = lastCheckInDate.getTime() === today.getTime();
              if (isMounted) setHasCheckedIn(checkedInToday);
            } catch (parseErr) {
              console.error('Error parsing date:', parseErr);
              if (isMounted) setHasCheckedIn(false);
            }
          } else {
            if (isMounted) setHasCheckedIn(false);
          }
        }
        
        // Add another small delay between calls
        await new Promise(resolve => setTimeout(resolve, 300));
        
        try {
          // Get check-in count with retry and fallback
          let count;
          try {
            count = await retry(async () => {
              return await publicClient.readContract({
                address: contract.address as Address,
                abi: contract.abi,
                functionName: 'getCurrentStreak',
                args: [userAddress as Address]
              });
            });
          } catch (innerErr) {
            console.error('Error calling getCheckInCount, using fallback:', innerErr);
            // Fallback to 0 if the call fails
            count = BigInt(0);
          }
          
          if (isMounted) setCheckInCount(Number(count));
        } catch (countErr: any) {
          console.error('Error handling check-in count:', countErr);
          hasError = true;
        }
        
        // Only show error if all calls failed
        if (hasError && isMounted) {
          setError('Some contract data could not be loaded. The contract may not be properly initialized or the network may be congested.');
        }
      } catch (err: any) {
        console.error('Error fetching contract data:', err);
        if (isMounted) {
          if (err.message?.includes('Contract address is not properly configured')) {
            setError('Contract address is not properly configured. Please check the contract address.');
          } else {
            setError('Failed to fetch contract data');
          }
        }
      }
    };

    // Only fetch data if publicClient and userAddress are available
    if (publicClient && userAddress) {
      fetchContractData();
    }
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [publicClient, userAddress]); // Removed lastCheckIn from dependency to prevent infinite loops

  // Countdown to next check-in (based on UTC midnight)
  useEffect(() => {
    if (!hasCheckedIn) return;

    const calculateTimeLeft = () => {
      const now = new Date();
      
      // Calcular segundos hasta la próxima medianoche UTC usando dateService
      const secondsUntilMidnight = getSecondsUntilNextUTCMidnight();
      
      // Convertir segundos a horas, minutos y segundos
      const hours = Math.floor(secondsUntilMidnight / 3600);
      const minutes = Math.floor((secondsUntilMidnight % 3600) / 60);
      const seconds = Math.floor(secondsUntilMidnight % 60);
      
      // Log para debugging
      if (hours === 0 && minutes <= 2) {
        console.log('DEBUG UTC Reset - Casi medianoche UTC:', getUTCDebugInfo('ContractInteraction', now));
      }
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Initial calculation
    setNextCheckInTime(calculateTimeLeft());
    
    // Update every second
    const timer = setInterval(() => {
      setNextCheckInTime(calculateTimeLeft());
    }, 1000);
    
    // Clean up on unmount
    return () => clearInterval(timer);
  }, [hasCheckedIn]);

  const handleCheckIn = async () => {
    if (!walletClient || !publicClient) {
      setError('Wallet client not available. Please connect your wallet.');
      return;
    }
    
    if (!userAddress) {
      setError('User address not available. Please connect your wallet.');
      return;
    }
    
    // Verificar si el usuario ya ha hecho check-in hoy
    if (hasCheckedIn) {
      setError('You have already checked in today. Please try again tomorrow.');
      return;
    }
    
    setIsLoading(true);
    setShowAnimation(true); // Show animation when check-in starts
    setError(null);
    setSuccess(null);
    
    // Verificar con los datos del hook si el usuario ya ha hecho check-in hoy
    if (userDataResponse?.data) {
      // Log the API response for debugging
      console.log("API response for check-in verification:", userDataResponse.data);
      
      // Log the can_checkin value for debugging
      console.log("Can check-in value from API during handleCheckIn:", userDataResponse.data.can_checkin);
      console.log("Hours remaining during handleCheckIn:", userDataResponse.data.hours_remaining);
      console.log("Checked in today UTC during handleCheckIn:", userDataResponse.data.checked_in_today_utc);
      
      // Check for UTC day verification - simplify to a single condition based on can_checkin
      if (userDataResponse.data.checked_in_today_utc) {
        setIsLoading(false);
        setShowAnimation(false); // Hide animation on error
        setError('You have already checked in today (UTC). Please try again tomorrow.');
        setHasCheckedIn(true);
        return;
      }
      
      // Usar la propiedad can_checkin que viene de la API
      if (!userDataResponse.data.can_checkin) {
        setIsLoading(false);
        setShowAnimation(false); // Hide animation on error
        setError(`You must wait ${userDataResponse.data.hours_remaining} hours before checking in again.`);
        return;
      }
    }
    
    try {
      // Obtener el contrato usando viem
      const { abi, address } = await getViemContract(publicClient, userAddress as Address);
      
      try {
        // Add a delay before making contract calls to avoid network congestion
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log("Attempting to check in with user address:", userAddress);
        
        try {
          // Usar directamente el userAddress que ya tenemos
          console.log("Proceeding with check-in for address:", userAddress);
          
          // Simular la transacción primero para verificar que funcionará
          const { request } = await publicClient.simulateContract({
            address: address as Address,
            abi,
            functionName: 'checkIn',
            args: [userAddress as Address],
            account: userAddress as Address,
          });
          
          // Enviar la transacción
          const hash = await walletClient.writeContract(request);
          
          console.log("Check-in transaction sent successfully, waiting for confirmation...");
          
          // Esperar a que la transacción se confirme
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          
          console.log("Check-in transaction confirmed successfully!");

          // Después de una transacción exitosa, registrar en Supabase
          try {
            // Simplemente registrar el check-in sin enviar datos de NFTs
            const response = await fetch('/api/check-in', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                wallet_address: userAddress,
                transaction_hash: hash
              }),
            });
            
            const result = await response.json();
            
            if (!response.ok) {
              console.error('Check-in API error:', result);
              throw new Error(result.error || 'Failed to register check-in');
            }
            
            // Check if streak was broken
            const streakBroken = result.streakBroken;
            
            console.log('Check-in API response:', {
              success: result.success,
              streakBroken: result.streakBroken,
              currentStreak: result.user?.current_streak,
              pointsEarned: result.points_earned,
              multiplier: result.multiplier
            });
            
            // Ya no necesitamos actualizar los parámetros de URL para el streak roto
            // ya que el mensaje se muestra directamente en el componente de streak
            
            // Actualizar la interfaz con la información de puntos
            const pointsMessage = result.points_earned > 0 ? 
              `Successfully checked in! You earned ${result.points_earned} points with a ${result.multiplier}x multiplier!` :
              `Successfully checked in!`;
            setSuccess(pointsMessage);
            
            // Actualizar el streak localmente de inmediato
            if (result.user?.current_streak !== undefined) {
              setStreak(result.user.current_streak);
            }
            
            // Marcar que ya se hizo check-in hoy
            setHasCheckedIn(true);
            
            // Actualizar el leaderboard si tenemos la dirección del usuario
            if (userAddress) {
              await updateLeaderboardStreak(userAddress, result.user?.current_streak || checkInCount);
            }
            
            // Invalidar los datos de usuario para forzar un refresh
            await invalidateUserData(userAddress);
            
            // Llamar al callback si existe
            if (onCheckInSuccess) {
              console.log("Calling onCheckInSuccess callback after successful check-in");
              onCheckInSuccess();
            } else {
              console.log("Warning: onCheckInSuccess callback not provided");
            }
          } catch (apiError) {
            console.error('API error:', apiError);
            // No bloquees la experiencia del usuario si falla el registro en Supabase
            setSuccess('Successfully checked in! (Bonus Reward registration pending)');
          }


        } catch (checkInError: any) {
          // Improved error logging to capture all relevant error properties
          console.error("CheckIn error details:", {
            message: checkInError.message,
            code: checkInError.code,
            name: checkInError.name,
            reason: checkInError.reason,
            error: checkInError.error,
            data: checkInError.data,
            stack: checkInError.stack
          });
          
          // Check for common error messages
          if (checkInError.message && checkInError.message.includes("already checked in")) {
            setError("You have already checked in today. Please try again tomorrow.");
            setIsLoading(false);
            setShowAnimation(false); // Hide animation on error
            return;
          } else if (checkInError.message && checkInError.message.includes("execution reverted")) {
            setError("The contract rejected the transaction. You may have already checked in today or another condition prevented the check-in.");
            setIsLoading(false);
            setShowAnimation(false); // Hide animation on error
            return;
          } else {
            // Re-throw for the outer catch block to handle
            throw checkInError;
          }
        }
        
        // Add a delay after transaction
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Instead of calling hasCheckedIn, we'll set it to true since we just checked in
        setHasCheckedIn(true);
        
        // Add a small delay between calls
        await new Promise(resolve => setTimeout(resolve, 300));
        
        try {
          try {
            // Update last check-in time with retry
            const lastCheckInTime = await retry(async () => {
              return await publicClient.readContract({
                address: address as Address,
                abi,
                functionName: 'getLastUpdatedPeriod',
                args: [userAddress as Address],
              });
            });
            
            // Get the current date for display purposes
            const now = new Date();
            // Format the date in Spanish style (day de month de year)
            const dateOptions: Intl.DateTimeFormatOptions = { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            };
            const timeOptions: Intl.DateTimeFormatOptions = {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            };
            // Combine date and time
            const dateStr = now.toLocaleDateString('en-US', dateOptions);
            const timeStr = now.toLocaleTimeString('en-US', timeOptions);
            setLastCheckIn(`${dateStr}\n${timeStr}`);
            
            // Also refresh the check-in status
            const isCheckedIn = await retry(async () => {
              return await publicClient.readContract({
                address: address as Address,
                abi,
                functionName: 'isCheckedInToday',
                args: [userAddress as Address],
              });
            });
            setHasCheckedIn(Boolean(isCheckedIn));
          } catch (innerErr) {
            console.error('Error updating last check-in time after check-in, using current time:', innerErr);
            // If failed, just use current time as fallback
            const date = new Date();
            setLastCheckIn(date.toLocaleString());
          }
        } catch (timeErr: any) {
          console.error('Error updating last check-in time:', timeErr);
          // Continue with other updates even if this one fails
        }
        
        // Add a small delay between calls
        await new Promise(resolve => setTimeout(resolve, 300));
        
        try {
          try {
            // Update check-in count with retry
            const count = await retry(async () => {
              return await publicClient.readContract({
                address: address as Address,
                abi,
                functionName: 'getCurrentStreak',
                args: [userAddress as Address],
              });
            });
            setCheckInCount(Number(count));
          } catch (innerErr) {
            console.error('Error updating check-in count after check-in, incrementing locally:', innerErr);
            // If failed, increment locally as fallback
            setCheckInCount(prev => prev + 1);
          }
        } catch (countErr: any) {
          console.error('Error updating check-in count:', countErr);
          // Continue with other updates even if this one fails
        }
        
        // Success message is already set in the API response handler
      } catch (txErr: any) {
          // Improved error logging with detailed error information
        console.error('Transaction error:', {
          message: txErr.message,
          code: txErr.code,
          name: txErr.name,
          reason: txErr.reason,
          error: txErr.error ? {
            message: txErr.error.message,
            code: txErr.error.code,
            data: txErr.error.data
          } : null,
          data: txErr.data,
          stack: txErr.stack
        });
        
        // Check for specific error messages
        if (txErr.message?.includes('User rejected the request')) {
          // Mensaje amigable cuando el usuario rechaza la transacción
          setError('Transaction cancelled. You cancelled the check-in request.');
        } else if (txErr.code === 'CALL_EXCEPTION' || txErr.code === 'UNPREDICTABLE_GAS_LIMIT') {
          if (txErr.error?.message === 'Failed to fetch') {
            setError('Network error: Unable to connect to the blockchain. Please check your network connection and try again.');
          } else if (txErr.error?.message?.includes('missing revert data') || txErr.error?.message?.includes('execution reverted')) {
            setError('Transaction reverted: The contract rejected this operation. You may have already checked in today or there might be another condition preventing the check-in.');
          } else if (txErr.error?.message?.includes('cannot estimate gas')) {
            setError('Gas estimation failed: The contract rejected this operation. You may have already checked in today or there might be another condition preventing the check-in.');
          } else {
            setError(txErr.message || 'Transaction failed');
          }
        } else {
          setError(txErr.message || 'Transaction failed');
        }
      }
    } catch (err: any) {
      console.error('Error checking in:', err);
      setError('Failed to interact with contract. Check if the contract address is correct.');
    } finally {
      setIsLoading(false);
      setShowAnimation(false); // Hide animation when check-in completes
    }
  };

  if (!walletClient || !publicClient) {
    return (
      <div className="p-6 bg-gray-100 rounded-lg shadow-md">
        <p className="text-center text-gray-600">Please connect your wallet to interact with the contract</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-md text-white">
      <h2 className="text-2xl font-bold mb-4 uppercase">Daily Check-in</h2>
      
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
              <p className="text-lg text-white whitespace-pre-line">{lastCheckIn}</p>
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
        <button
          ref={buttonRef}
          onClick={handleCheckIn}
          disabled={isLoading || hasCheckedIn || nftCalculationInProgress}
          className={`w-full px-6 py-3 rounded-lg font-bold text-lg transition-all duration-300 ${
            hasCheckedIn
              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
              : isLoading
              ? 'bg-blue-700 text-white cursor-wait'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Checking in...' : hasCheckedIn ? 'Already Checked In' : 'Check In Now'}
        </button>
        
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

export default ContractInteraction;
