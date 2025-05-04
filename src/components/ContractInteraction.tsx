'use client';

import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { getContract, retry, safeNumberFromBN, safeStringFromBN, directContractCall, RONIN_CHAIN_IDS } from '@/utils/contract';
import { createClient } from '@/utils/supabase/client';

interface ContractInteractionProps {
  provider: ethers.providers.Web3Provider | null;
  onCheckInSuccess?: () => void;
  userAddress?: string | null;
  nftCalculationInProgress?: boolean;
  refreshTrigger?: number; // New prop to trigger updates
}

const ContractInteraction: React.FC<ContractInteractionProps> = ({ provider, onCheckInSuccess, userAddress: externalUserAddress, nftCalculationInProgress, refreshTrigger }) => {
  const [streak, setStreak] = useState<number>(0);
  const [nextCheckInTime, setNextCheckInTime] = useState<string>('');
  const [streakBroken, setStreakBroken] = useState<boolean>(false);
  // Añade esta función
  const updateLeaderboardStreak = async (walletAddress: string, currentStreak: number) => {
    try {
      const supabase = createClient();
      
      // Primero obtener los datos existentes del leaderboard
      const { data: existingData, error: fetchError } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();
      
      // Preparar datos para actualizar
      const leaderboardData: any = {
        wallet_address: walletAddress.toLowerCase(),
        current_streak: currentStreak,
        best_streak: currentStreak, // Actualizar best streak con el valor actual
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Si ya existía un registro, preservar los campos que no estamos actualizando
      if (existingData && !fetchError) {
        // Si el best_streak existente es mayor que el current_streak, mantenerlo
        if (existingData.best_streak !== undefined && existingData.best_streak > currentStreak) {
          leaderboardData.best_streak = existingData.best_streak;
        }
        
        // Preservamos los campos que no estamos actualizando explícitamente
        if (existingData.tokens_claimed !== undefined) 
          leaderboardData.tokens_claimed = existingData.tokens_claimed;
        
        if (existingData.nft_count !== undefined) 
          leaderboardData.nft_count = existingData.nft_count;
      }
      
      // Actualizar leaderboard con todos los datos
      await supabase
        .from('leaderboard')
        .upsert(leaderboardData, { onConflict: 'wallet_address' });
        
    } catch (err) {
      console.error('Error updating leaderboard streak:', err);
    }
  };
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
    
    // Reset all state when provider changes
    resetState();
    
    const fetchContractData = async () => {
      if (!provider) {
        console.error("Provider is not available");
        return;
      }
      
      console.log("Fetching data for new wallet connection...");
      
      // Verificar explícitamente si tenemos acceso a las cuentas
      try {
        // Esta es una verificación crítica para prevenir el error "unknown account #0"
        const accounts = await provider.listAccounts();
        if (!accounts || accounts.length === 0) {
          if (isMounted) {
            console.error("No accounts available - user may need to connect wallet");
            setError('No accounts found in wallet. Please connect your wallet.');
          }
          return;
        }
        
        // Si llegamos aquí, tenemos al menos una cuenta
        const currentAddress = accounts[0];
        console.log("Found account:", currentAddress);
        
        // Establecer la dirección actual - esto es importante para evitar llamadas a getAddress() más adelante
        if (isMounted) setUserAddress(currentAddress);
      } catch (accountError) {
        console.error("Error accessing accounts:", accountError);
        if (isMounted) setError('Error accessing wallet accounts. Please reconnect your wallet.');
        return;
      }
      
      // Get network information
      try {
        const network = await provider.getNetwork();
        if (isMounted) {
          setNetworkInfo({
            chainId: network.chainId,
            networkName: getNetworkName(network.chainId)
          });
        }
      } catch (err) {
        console.error("Error fetching network information:", err);
      }
      
      // Force a complete reset of the provider state
      try {
        // Get fresh accounts
        const freshAccounts = await provider.listAccounts();
        
        // If no accounts, don't try to load data
        if (!freshAccounts || freshAccounts.length === 0) {
          if (isMounted) setError('No accounts found in wallet');
          return;
        }
        
        // Set the current user address
        if (isMounted) setUserAddress(freshAccounts[0]);
        
        // Silent delay to ensure the provider is fully connected with the new account
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
          const contract = await getContract(provider);
          
          try {
            const accounts = await provider.listAccounts();
            
            // Guard against unmounted component
            if (!isMounted) return;
            
            if (accounts.length > 0) {
              setUserAddress(accounts[0]);
              
              // Add a delay before making contract calls to avoid network congestion
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // We'll try each contract call separately and continue even if some fail
              let hasError = false;
              
              try {
                try {
                  // Get contract owner with retry
                  const owner = await retry(async () => {
                    return await contract.owner();
                  });
                  if (isMounted) setContractOwner(owner);
                } catch (e) {
                  console.error('Error getting owner:', e);
                  // If standard owner approach fails, we'll still try one more time but with a slight delay
                  await new Promise(resolve => setTimeout(resolve, 800));
                  try {
                    // Retry once more with the enhanced approach in our contract utility
                    const retryOwner = await contract.owner();
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
                  const userResponse = await fetch(`/api/user-data?wallet_address=${accounts[0].toLowerCase()}`);
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
                    
                    if (userData.data.checked_in_today_utc === true) {
                      console.log("Usuario ya hizo check-in hoy (UTC) según la base de datos");
                      if (isMounted) setHasCheckedIn(true);
                    } else if (userData.data.hours_since_last_checkin < 24) {
                      console.log(`Debe esperar ${userData.data.hours_remaining} horas más para hacer check-in`);
                      if (isMounted) {
                        setError(`You must wait ${userData.data.hours_remaining} hours before checking in again`);
                      }
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
                      return await contract.getLastUpdatedPeriod(accounts[0]);
                    });
                  } catch (innerErr) {
                    console.error('Error calling getLastCheckIn, trying alternative approach:', innerErr);
                    // Fallback to 0 if the call fails
                    lastCheckInTime = ethers.BigNumber.from(0);
                  }
                  
                  if (isMounted) {
                    if (!lastCheckInTime.isZero()) {
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
                  return await contract.isCheckedInToday(accounts[0]);
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
                    return await contract.getCurrentStreak(accounts[0]);
                  });
                } catch (innerErr) {
                  console.error('Error calling getCheckInCount, using fallback:', innerErr);
                  // Fallback to 0 if the call fails
                  count = ethers.BigNumber.from(0);
                }
                
                if (isMounted) setCheckInCount(count.toNumber());
              } catch (countErr: any) {
                console.error('Error handling check-in count:', countErr);
                hasError = true;
              }
              
              // Only show error if all calls failed
              if (hasError && isMounted) {
                setError('Some contract data could not be loaded. The contract may not be properly initialized or the network may be congested.');
              }
            }
          } catch (accountsErr: any) {
            console.error('Error getting accounts:', accountsErr);
            if (isMounted) setError('Failed to get wallet accounts');
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

    // Only fetch data if provider is available
    if (provider) {
      fetchContractData();
    }
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [provider]); // Removed lastCheckIn from dependency to prevent infinite loops

  // Countdown to next check-in (based on UTC midnight)
  useEffect(() => {
    if (!hasCheckedIn) return;

    const calculateTimeLeft = () => {
      const now = new Date();
      
      // Calculate time until the next UTC midnight
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0); // Next UTC midnight
      
      const difference = tomorrow.getTime() - now.getTime();
      
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      
      // Log para debugging
      if (hours === 23 && minutes >= 58) {
        console.log('DEBUG UTC Reset - Casi medianoche UTC:', {
          now: now.toISOString(),
          nowUTC: new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            now.getUTCSeconds()
          )).toISOString(),
          nextMidnight: tomorrow.toISOString(),
          difference,
          hours, minutes, seconds
        });
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
    if (!provider) {
      setError('Wallet provider not available. Please connect your wallet.');
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
      
      if (userData.data) {
        // Check for UTC day verification
          if (userData.data.checked_in_today_utc) {
            setIsLoading(false);
            setShowAnimation(false); // Hide animation on error
            setError('You have already checked in today (UTC). Please try again tomorrow.');
            setHasCheckedIn(true);
            return;
          }
          
          // Check for 24 hour period
          if (userData.data.hours_since_last_checkin < 24) {
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
      const contract = await getContract(provider);
      
      try {
        // Add a delay before making contract calls to avoid network congestion
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log("Attempting to check in with user address:", userAddress);
        
        try {
          // Usar directamente el userAddress que ya tenemos
          // No intentamos obtener el signer address aquí para evitar el error
          console.log("Proceeding with check-in for address:", userAddress);
          
          // Call checkIn function with user's address
          const tx = await contract.checkIn(userAddress);
          
          console.log("Check-in transaction sent successfully, waiting for confirmation...");
          await tx.wait();
          console.log("Check-in transaction confirmed successfully!");

          // Después de una transacción exitosa, registrar en Supabase
          try {
            const response = await fetch('/api/check-in', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                wallet_address: userAddress,
                transaction_hash: tx.hash,
              }),
            });
            
            const result = await response.json();
            
            if (!response.ok) {
              throw new Error(result.error || 'Failed to register check-in');
            }
            
            // Check if streak was broken
            const streakBroken = result.streakBroken;
            
            // If streak was broken, redirect with streakBroken parameter
            if (streakBroken) {
              // Update the URL with streakBroken and check_in parameters
              const url = new URL(window.location.href);
              url.searchParams.set('check_in', 'true');
              url.searchParams.set('streak_broken', 'true');
              window.history.pushState({}, '', url.toString());
            }
            
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
            return await contract.getLastUpdatedPeriod(userAddress);
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
            return await contract.isCheckedInToday(userAddress);
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
              return await contract.getCurrentStreak(userAddress);
            });
            setCheckInCount(count.toNumber());
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

  if (!provider) {
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
