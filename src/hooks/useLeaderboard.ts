import { useQuery } from '@tanstack/react-query';

interface LeaderboardEntry {
  wallet_address: string;
  points_earned: number;
  best_streak: number;
  current_streak: number;
  tokens_claimed: number;
  last_active: string;
  rank?: number;
}

interface LeaderboardResponse {
  data: LeaderboardEntry[];
  totalPages: number;
  currentPage: number;
  hasMore: boolean;
  error?: string;
}

interface LeaderboardParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'points' | 'streak' | 'tokens';
  filter?: 'all' | 'active';
}

async function fetchLeaderboard({
  page = 1,
  pageSize = 10,
  sortBy = 'points',
  filter = 'all'
}: LeaderboardParams = {}): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    sortBy,
    filter
  });
  
  const response = await fetch(`/api/get-leaderboard?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
  }
  
  return response.json();
}

export function useLeaderboard(params: LeaderboardParams = {}) {
  return useQuery<LeaderboardResponse, Error>({
    queryKey: ['leaderboard', params],
    queryFn: () => fetchLeaderboard(params),
    staleTime: 5 * 60 * 1000, // Los datos son frescos por 5 minutos
    gcTime: 30 * 60 * 1000, // Mantener en cache por 30 minutos
    refetchInterval: false, // Desactivar refetch automático
    refetchOnWindowFocus: false, // No refetch cuando la ventana recupera el foco
    retry: (failureCount, error) => {
      // No reintentar si es un error 4xx
      if (error.message.includes('4')) return false;
      return failureCount < 3;
    },
  });
}

// Hook para buscar un usuario específico en el leaderboard
export function useLeaderboardUser(walletAddress: string | null | undefined) {
  return useQuery<LeaderboardEntry | null, Error>({
    queryKey: ['leaderboard', 'user', walletAddress?.toLowerCase()],
    queryFn: async () => {
      if (!walletAddress) return null;
      
      // Hacer una sola llamada específica para el usuario
      try {
        const response = await fetch(`/api/get-leaderboard?wallet_address=${walletAddress.toLowerCase()}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // El API devuelve userEntry cuando se proporciona wallet_address
        if (data.userEntry) {
          return data.userEntry;
        }
        
        return null;
      } catch (error) {
        console.error('Error fetching user leaderboard data:', error);
        return null;
      }
    },
    enabled: !!walletAddress,
    staleTime: 2 * 60 * 1000, // Aumentar el stale time a 2 minutos
    gcTime: 10 * 60 * 1000, // Mantener en cache por 10 minutos
    refetchOnWindowFocus: false, // No refetch cuando la ventana recupera el foco
    refetchOnMount: false, // No refetch cuando el componente se monta
  });
}

// Hook para invalidar los datos del leaderboard
import { useQueryClient } from '@tanstack/react-query';

export function useInvalidateLeaderboard() {
  const queryClient = useQueryClient();
  
  return () => {
    // Invalidar todos los datos del leaderboard
    return queryClient.invalidateQueries({ 
      queryKey: ['leaderboard'] 
    });
  };
}