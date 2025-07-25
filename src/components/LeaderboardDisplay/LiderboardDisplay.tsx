'use client';

import { useState, useEffect } from 'react';
import { useConnectorStore } from '@/hooks/useConnectorStore';
import { useLeaderboard, useLeaderboardUser, useInvalidateLeaderboard } from '@/hooks/useLeaderboard';

interface LeaderboardDisplayProps {
  refreshTrigger?: number;
}

interface LeaderboardEntry {
  wallet_address: string;
  user_name: string | null;
  tokens_claimed: number;
  points_earned: number;
  best_streak: number;
  current_streak: number;
  last_active: string;
  nft_count: number;
  rank?: number;
}

const LeaderboardDisplay = ({ refreshTrigger = 0 }: LeaderboardDisplayProps) => {
  const { account } = useConnectorStore();
  
  // Usar el hook de TanStack Query para obtener datos del leaderboard
  const { data: leaderboardResponse, isLoading, error, refetch } = useLeaderboard({
    page: 1,
    pageSize: 100, // Mostrar top 100
    sortBy: 'points',
    filter: 'all'
  });
  
  // Hook para obtener datos específicos del usuario
  const { data: userRankData } = useLeaderboardUser(account);
  const invalidateLeaderboard = useInvalidateLeaderboard();
  
  // Estado local para mantener compatibilidad con el componente existente
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null);
  
  // Actualizar datos cuando cambie la respuesta del hook
  useEffect(() => {
    if (leaderboardResponse?.data) {
      // Mapear los datos al formato esperado por el componente
      const mappedData = leaderboardResponse.data.map((entry, index) => ({
        ...entry,
        user_name: entry.user_name || null,
        rank: index + 1
      }));
      setLeaderboardData(mappedData);
    }
  }, [leaderboardResponse]);
  
  // Actualizar datos del usuario cuando cambien
  useEffect(() => {
    if (userRankData) {
      setUserEntry({
        ...userRankData,
        user_name: userRankData.user_name || null
      });
    } else {
      setUserEntry(null);
    }
  }, [userRankData]);
  
  // Invalidar y refrescar cuando cambie el trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      invalidateLeaderboard();
    }
  }, [refreshTrigger, invalidateLeaderboard]);
  
  // Helper function to render a table row
  const renderTableRow = (entry: LeaderboardEntry, index: number, isCurrentUser: boolean = false) => {
    return (
      <tr 
        key={entry.wallet_address} 
        className={`border-b border-gray-500 ${isCurrentUser 
          ? 'bg-yellow-700 hover:bg-yellow-600' 
          : 'hover:bg-gray-600'}`}
      >
        <td className="py-3 px-4 font-medium">
          #{entry.rank || index + 1}
        </td>
        <td className="py-3 px-4">
          {isCurrentUser ? (
            <span className="flex items-center">
              <span className="mr-2">👤</span>
              {entry.user_name || `${entry.wallet_address.substring(0, 6)}...${entry.wallet_address.substring(entry.wallet_address.length - 4)}`}
            </span>
          ) : (
            entry.user_name || `${entry.wallet_address.substring(0, 6)}...${entry.wallet_address.substring(entry.wallet_address.length - 4)}`
          )}
        </td>
        <td className="py-3 px-4 text-right">{entry.nft_count}</td>
        <td className="py-3 px-4 text-right font-medium">{entry.tokens_claimed.toLocaleString()}</td>
      </tr>
    );
  };

  // Is user in top 10?
  const isUserInLeaderboard = account ? 
    leaderboardData.some(entry => entry.wallet_address.toLowerCase() === account.toLowerCase()) : 
    false;

  // Should we show the separate user row?
  const showUserRow = Boolean(userEntry && account && !isUserInLeaderboard);

  return (
    <div className="bg-gray-800 rounded-lg shadow-md p-6 text-white">
      <h2 className="text-2xl font-bold mb-4 uppercase">Top Fire Dust Collectors</h2>
      
      {isLoading ? (
        <div className="text-center py-4">Loading leaderboard data...</div>
      ) : error ? (
        <div className="text-center py-4 text-red-400">Error loading leaderboard. Please try again later.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-gray-700 text-white">
            <thead>
              <tr className="bg-gray-600 border-b border-gray-500">
                <th className="py-3 px-4 text-left">Rank</th>
                <th className="py-3 px-4 text-left">User</th>
                <th className="py-3 px-4 text-right">Total Primos</th>
                <th className="py-3 px-4 text-right">Claimed Tokens</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardData.map((entry, index) => {
                // Check if this entry is the current user
                const isCurrentUser = Boolean(account && entry.wallet_address.toLowerCase() === account.toLowerCase());
                return renderTableRow(entry, index, isCurrentUser);
              })}
              
              {/* If user is not in top 10, show their entry in a highlighted row */}
              {showUserRow && userEntry && (
                <>
                  {/* Add a separator row if there's data */}
                  {leaderboardData.length > 0 && (
                    <tr className="border-b border-gray-500">
                      <td colSpan={4} className="py-2 text-center text-gray-400 bg-gray-700">
                        <div className="flex items-center justify-center">
                          <div className="border-t border-dashed border-gray-500 flex-grow mx-4"></div>
                          <span>Your Position</span>
                          <div className="border-t border-dashed border-gray-500 flex-grow mx-4"></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {renderTableRow(userEntry, 0, true)}
                </>
              )}
              
              {leaderboardData.length === 0 && !userEntry && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400">
                    No data available yet. Be the first to claim reward tokens!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LeaderboardDisplay;