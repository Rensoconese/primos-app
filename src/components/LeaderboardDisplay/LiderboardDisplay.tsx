'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { useConnectorStore } from '@/hooks/useConnectorStore';

interface LeaderboardDisplayProps {
  refreshTrigger?: number;
}

interface LeaderboardEntry {
  wallet_address: string;
  user_name: string | null;
  tokens_claimed: number;
  points_earned: number; // keeping in interface though not displayed
  best_streak: number;
  nft_count: number;
  rank?: number;
}

const LeaderboardDisplay = ({ refreshTrigger = 0 }: LeaderboardDisplayProps) => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null);
  const { account } = useConnectorStore();
  
  // Función para obtener datos del leaderboard usando el endpoint de API
  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      // Construir la URL con el parámetro wallet_address si el usuario está conectado
      let url = '/api/get-leaderboard';
      if (account) {
        url += `?wallet_address=${account.toLowerCase()}`;
      }
      
      // Añadir un parámetro de timestamp para evitar caché
      const timestamp = new Date().getTime();
      url += `${url.includes('?') ? '&' : '?'}t=${timestamp}`;
      
      console.log(`Fetching leaderboard data from: ${url}`);
      
      // Realizar la petición al endpoint con cache: 'no-store' para evitar caché
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch leaderboard');
      }
      
      const result = await response.json();
      console.log('Leaderboard data received:', result);
      
      // Actualizar el estado con los datos recibidos
      setLeaderboardData(result.data || []);
      setUserEntry(result.userEntry);
      
      // Log para depuración
      if (account) {
        const userInTop = result.data?.find((entry: any) => 
          entry.wallet_address.toLowerCase() === account.toLowerCase()
        );
        
        if (userInTop) {
          console.log(`User found in top leaderboard: tokens_claimed=${userInTop.tokens_claimed}`);
        } else if (result.userEntry) {
          console.log(`User entry (not in top): tokens_claimed=${result.userEntry.tokens_claimed}, rank=${result.userEntry.rank}`);
        } else {
          console.log('User not found in leaderboard data');
        }
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Efecto para cargar datos cuando cambia account o refreshTrigger
  useEffect(() => {
    fetchLeaderboard();
    // Ya no actualizamos cada minuto, solo cuando cambia refreshTrigger o account
  }, [account, refreshTrigger]); // Re-run when account or refreshTrigger changes
  
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
      
      {loading ? (
        <div className="text-center py-4">Loading leaderboard data...</div>
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
