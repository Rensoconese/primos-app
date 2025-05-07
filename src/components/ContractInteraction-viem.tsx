'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  type PublicClient, 
  type WalletClient,
  type Account
} from 'viem';
import { ronin, roninSaigon } from '@/utils/chain';
import { getCheckInContract } from '@/utils/contract-types-viem';
import { retry } from '@/utils/contract-viem';
import { getSecondsUntilNextUTCMidnight, formatDateForDebug, getUTCDebugInfo } from '@/services/dateService';
import { updateLeaderboardStreak } from '@/services/leaderboardService';

// Definir los chain IDs para Ronin
const RONIN_CHAIN_IDS = {
  MAINNET: 2020,
  TESTNET: 2021
};

interface ContractInteractionProps {
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  account: Account | null;
  onCheckInSuccess?: () => void;
  userAddress?: string | null;
  nftCalculationInProgress?: boolean;
  refreshTrigger?: number; // New prop to trigger updates
}

const ContractInteraction: React.FC<ContractInteractionProps> = ({ 
  publicClient, 
  walletClient, 
  account, 
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
  
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{ chainId: number; networkName: string } | null>(null);
  const [showAnimation, setShowAnimation] = useState<boolean>(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
    setUserAddress(null);
    setNetworkInfo(null);
  };

  useEffect(() => {
    // Load streak data from API instead of direct Supabase access
    const loadStreakData = async () => {
      if (!externalUserAddress) return;
      
      try {
        console.log('Fetching streak data from API...');
        const response = await fetch(`/api/user-data?wallet_address=${externalUserAddress.toLowerCase()}`);
        const result = await response.json();
        
        if (result.error) {
          console.error('Error loading streak data:', result.error);
          return;
        }
        
        if (result.data) {
          setStreak(result.data.current_streak || 0);
        } else {
          // User not found, initialize streak to 0
          setStreak(0);
        }
      } catch (err) {
        console.error('Error loading user streak data:', err);
      }
    };
    
    loadStreakData();
  }, [externalUserAddress, refreshTrigger]); // Added refreshTrigger as a dependency

  useEffect(() => {
    // Flag to prevent state updates if the component unmounts
    let isMounted = true;
    
    // Reset all state when client changes
    resetState();
    
    const fetchContractData = async () => {
      if (!publicClient || !walletClient || !account) {
        console.error("Client or account is not available");
        return;
      }
      
      console.log("Fetching data for new wallet connection...");
      
      try {
        // Set the current user address
        const currentAddress = account.address;
        console.log("Found account:", currentAddress);
        
        if (isMounted) setUserAddress(currentAddress);
        
        // Get network information
        try {
          const chainId = publicClient.chain?.id || 0;
          if (isMounted) {
            setNetworkInfo({
              chainId,
              networkName: getNetworkName(chainId)
            });
          }
        } catch (err) {
          console.error("Error fetching network information:", err);
        }
        
        // Silent delay to ensure the client is fully connected
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
          // Get contract configuration
          const contract = getCheckInContract(publicClient.chain?.id);
          
          try {
            // Guard against unmounted component
            if (!isMounted) return;
            
            setUserAddress(account.address);
            
            // Add a delay before making contract calls to avoid network congestion
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // We'll try each contract call separately and continue even if some fail
            let hasError = false;
            
            try {
              try {
                // Get contract owner with retry
                const owner = await retry(async () => {
                  return await publicClient.readContract({
                    ...contract,
                    functionName: 'owner'
                  }) as `0x${string}`;
                });
                if (isMounted) setContractOwner(owner);
              } catch (e) {
                console.error('Error getting owner:', e);
                // If standard owner approach fails, we'll still try one more time but with a slight delay
                await new Promise(resolve => setTimeout(resolve, 800));
                try {
                  // Retry once more
                  const retryOwner = await publicClient.readContract({
                    ...contract,
                    functionName: 'owner'
                  }) as `0x${string}`;
                  if (isMounted) setContractOwner(retryOwner);
                } catch (retryErr) {
                  console.error('Retry error getting owner:', retryErr);
                  if (isMounted) setContractOwner(null);
                }
              }
            } catch (ownerErr: any) {
              console.error('Error getting contract owner:', ownerErr);
              hasError = true;
            }
            
            // Add another small delay between calls
            await new Promise(resolve => setTimeout(resolve, 300));
            
            try {
              // Obtener datos del usuario para verificar el último check-in
              try {
                // Primero consultamos a la API para obtener datos del usuario
                const userResponse = await fetch(`/api/user-data?wallet_address=${account.address.toLowerCase()}`);
                const userData = await userResponse.json();
                
                if (userData.data) {
                  // Check if streak is broken during initial load
                  // Only show streak broken message if streak is still 0
                  if (userData.data.streak_broken && userData.data.current_streak === 0) {
                    console.log("Streak broken detected during initial load");
                    // Update URL to trigger streak broken notification in NFTDisplay
                    const url = new URL(window.location.href);
                    url.searchParams.set('check_in', 'true');
                    url.searchParams.set('streak_broken', 'true');
                    window.history.pushState({}, '', url.toString());
                    
                    // Set streakBroken state
                    if (isMounted) setStreakBroken(true);
                  } else if (userData.data.current_streak > 0) {
                    // If streak is positive, clear the streakBroken flag
                    if (isMounted) setStreakBroken(false);
                  }
                  
                  // Log the can_checkin value for debugging
                  console.log("Can check-in value from API:", userData.data.can_checkin);
                  console.log("Hours remaining:", userData.data.hours_remaining);
                  console.log("Checked in today UTC:", userData.data.checked_in_today_utc);
                  
                  if (userData.data.checked_in_today_utc === true) {
                    console.log("Usuario ya hizo check-in hoy (UTC) según la base de datos");
                    if (isMounted) setHasCheckedIn(true);
                  } else if (!userData.data.can_checkin) {
                    // Use can_checkin property from API instead of hours_since_last_checkin
                    console.log(`Debe esperar ${userData.data.hours_remaining} horas más para hacer check-in`);
                    if (isMounted) {
                      setError(`You must wait ${userData.data.hours_remaining} hours before checking in again`);
                    }
                  } else {
                    // Clear any error if the user can check in
                    if (isMounted) setError(null);
                  }
                  
                  if (userData.data.last_check_in) {
                    const lastCheckInDate = new Date(userData.data.last_check_in);
                    
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
                      ...contract,
                      functionName: 'getLastUpdatedPeriod',
                      args: [account.address]
                    }) as bigint;
                  });
                } catch (innerErr) {
                  console.error('Error calling getLastCheckIn, trying alternative approach:', innerErr);
                  // Fallback to 0 if the call fails
                  lastCheckInTime = BigInt(0);
                }
                
                if (isMounted) {
                  if (lastCheckInTime !== BigInt(0)) {
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
            } catch (timeErr: any) {
              console.error('Error handling last check-in time:', timeErr);
              hasError = true;
            }
            
            // Add another small delay between calls
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Try to get check-in status directly from contract first
            try {
              const checkedIn = await retry(async () => {
                return await publicClient.readContract({
                  ...contract,
                  functionName: 'isCheckedInToday',
                  args: [account.address]
                }) as boolean;
              });
              if (isMounted) setHasCheckedIn(checkedIn);
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
                    ...contract,
                    functionName: 'getCurrentStreak',
                    args: [account.address]
                  }) as bigint;
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
          } catch (accountsErr: any) {
            console.error('Error with account:', accountsErr);
            if (isMounted) setError('Failed to get wallet account');
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
      } catch (err: any) {
        console.error('Error starting data fetch:', err);
        if (isMounted) setError('Failed to connect to wallet');
      }
    };

    // Only fetch data if clients and account are available
    if (publicClient && walletClient && account) {
      fetchContractData();
    }
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [publicClient, walletClient, account]); // Removed lastCheckIn from dependency to prevent infinite loops

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
    if (!publicClient || !walletClient || !account) {
      setError('Wallet not connected. Please connect your wallet.');
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
    
    // Verificar con la API si el usuario ya ha hecho check-in hoy
    try {
      // Obtenemos los datos del usuario para verificar el último check-in
      const userDataResponse = await fetch(`/api/user-data?wallet_address=${userAddress.toLowerCase()}`);
      const userData = await userDataResponse.json();
      
      // Log the API response for debugging
      console.log("API response for check-in verification:", userData.data);
      
      if (userData.data) {
        // Log the can_checkin value for debugging
        console.log("Can check-in value from API during handleCheckIn:", userData.data.can_checkin);
        console.log("Hours remaining during handleCheckIn:", userData.data.hours_remaining);
        console.log("Checked in today UTC during handleCheckIn:", userData.data.checked_in_today_utc);
        
        // Check for UTC day verification - simplify to a single condition based on can_checkin
        if (userData.data.checked_in_today_utc) {
          setIsLoading(false);
          setShowAnimation(false); // Hide animation on error
          setError('You have already checked in today (UTC). Please try again tomorrow.');
          setHasCheckedIn(true);
          return;
        }
        
        // Usar la propiedad can_checkin que viene de la API
        if (!userData.data.can_checkin) {
          setIsLoading(false);
          setShowAnimation(false); // Hide animation on error
          setError(`You must wait ${userData.data.hours_remaining} hours before checking in again.`);
          return;
        }
      }
    } catch (verifyError) {
      console.error('Error verificando check-in previo:', verifyError);
      // Continuamos aunque falle la verificación
    }
    
    try {
      // Get contract configuration
      const contract = getCheckInContract(publicClient.chain?.id);
      
      try {
        // Add a delay before making contract calls to avoid network congestion
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log("Attempting to check in with user address:", userAddress);
        
        try {
          // Simulate the transaction first
          const { request } = await publicClient.simulateContract({
            ...contract,
            functionName: 'checkIn',
            args: [userAddress as `0x${string}`],
            account: account.address
          });
          
          // Send the transaction
          const hash = await walletClient.writeContract(request);
          
          console.log("Check-in transaction sent successfully, waiting for confirmation...");
          
          // Wait for transaction confirmation
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
              throw new Error(result.error || 'Failed to register check-in');
            }
            
            // Check if streak was broken
            const streakBroken = result.streakBroken;
            
            // Ya no necesitamos actualizar los parámetros de URL para el streak roto
            // ya que el mensaje se muestra directamente en el componente de streak
            
            // Actualizar la interfaz con la información de puntos
            setSuccess(`Successfully checked in! `);
            
            // Actualizar el leaderboard si tenemos la dirección del usuario
            if (userAddress) {
              await updateLeaderboardStreak(userAddress, checkInCount);
            }
            
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
                ...contract,
                functionName: 'getLastUpdatedPeriod',
                args: [userAddress as `0x${string}`]
              }) as bigint;
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
                ...contract,
                functionName: 'isCheckedInToday',
                args: [userAddress as `0x${string}`]
              }) as boolean;
            });
            setHasCheckedIn(isCheckedIn);
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
                ...contract,
                functionName: 'getCurrentStreak',
                args: [userAddress as `0x${string}`]
              }) as bigint;
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
        if (txErr.code === 'CALL_EXCEPTION' || txErr.code === 'UNPREDICTABLE_GAS_LIMIT') {
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

  if (!publicClient || !walletClient || !account) {
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
              {streak === 0 && (
                <div className="mt-1 text-red-500 text-sm font-semibold">
                  Streak lost! Remember to check in daily.
                </div>
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
              <h3 className="font-bold text-lg text-white">Last Check-in:</h3>
              <p className="font-bold whitespace-pre-line text-white">{lastCheckIn}</p>
            </div>
          </div>
        </div>
      </div>
      
      <button
        ref={buttonRef}
        onClick={handleCheckIn}
        disabled={isLoading || hasCheckedIn || nftCalculationInProgress}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 mb-4"
      >
        {isLoading ? 'Processing...' : 
         hasCheckedIn ? 'Already Checked In Today' : 
         nftCalculationInProgress ? 'Calculating NFT Rewards...' : 
         'Check In Now'}
      </button>
      
      {/* Animation between button and cards */}
      {showAnimation && (
        <div className="mb-4">
          <video 
            src="/videos/bucle_o.webm"
            autoPlay
            loop
            muted
            className="w-full h-auto"
          />
        </div>
      )}
      
      {nftCalculationInProgress && (
        <div className="text-center mb-4">
          <p className="text-sm text-yellow-400">
            Please wait while we calculate your NFT rewards. This may take a moment for large collections.
          </p>
        </div>
      )}
      
      {hasCheckedIn && nextCheckInTime && (
        <div className="text-center mb-4">
          <p className="text-sm text-gray-400">Next check-in available in: {nextCheckInTime}</p>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-2 bg-red-100 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mt-4 p-2 bg-green-100 text-green-700 rounded-md text-sm">
          {success}
        </div>
      )}
    </div>
  );
};

export default ContractInteraction;
