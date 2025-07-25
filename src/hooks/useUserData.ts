import { useQuery } from '@tanstack/react-query';

interface UserData {
  id: string;
  wallet_address: string;
  current_streak: number;
  max_streak: number;
  total_check_ins: number;
  total_points: number;
  last_check_in: string | null;
  created_at: string;
  updated_at: string;
  checked_in_today_utc?: boolean;
  can_checkin?: boolean;
  hours_remaining?: number;
  hours_since_last_checkin?: number;
  days_since_last_checkin?: number;
  streak_broken?: boolean;
}

interface UserDataResponse {
  data: UserData | null;
  error?: string;
}

async function fetchUserData(walletAddress: string): Promise<UserDataResponse> {
  if (!walletAddress) {
    throw new Error('Wallet address is required');
  }

  const response = await fetch(`/api/user-data?wallet_address=${walletAddress.toLowerCase()}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch user data: ${response.statusText}`);
  }
  
  return response.json();
}

export function useUserData(walletAddress: string | null | undefined) {
  return useQuery<UserDataResponse, Error>({
    queryKey: ['userData', walletAddress?.toLowerCase()],
    queryFn: () => fetchUserData(walletAddress!),
    enabled: !!walletAddress, // Solo ejecutar si hay wallet address
    staleTime: 60 * 1000, // Los datos son frescos por 60 segundos
    gcTime: 5 * 60 * 1000, // Mantener en cache por 5 minutos
    refetchInterval: false, // No refetch automático - se actualiza manualmente tras acciones
    retry: (failureCount, error) => {
      // No reintentar si es un error 4xx
      if (error.message.includes('4')) return false;
      return failureCount < 3;
    },
  });
}

// Hook para invalidar los datos de usuario (útil después de check-in o claim)
import { useQueryClient } from '@tanstack/react-query';

export function useInvalidateUserData() {
  const queryClient = useQueryClient();
  
  return (walletAddress?: string) => {
    if (walletAddress) {
      return queryClient.invalidateQueries({ 
        queryKey: ['userData', walletAddress.toLowerCase()] 
      });
    }
    // Invalidar todos los datos de usuario
    return queryClient.invalidateQueries({ 
      queryKey: ['userData'] 
    });
  };
}