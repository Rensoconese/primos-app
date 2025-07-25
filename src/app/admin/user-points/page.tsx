'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectorStore } from '@/hooks/useConnectorStore';

interface UserData {
  wallet_address: string;
  total_points: number;
  current_streak: number;
  max_streak: number;
  total_check_ins: number;
  last_check_in: string;
  created_at: string;
  total_tokens_claimed: number;
  rewards_history: Array<{
    tokens_received: number;
    created_at: string;
  }>;
}

export default function UserPointsPage() {
  const router = useRouter();
  const { account: address } = useConnectorStore();
  const [searchWallet, setSearchWallet] = useState('');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newPoints, setNewPoints] = useState('');
  const [reason, setReason] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    if (!address) {
      router.push('/admin');
      return;
    }
  }, [address, router]);

  const searchUser = async () => {
    if (!searchWallet) return;

    try {
      setLoading(true);
      setUserData(null);
      setUpdateSuccess(false);

      const response = await fetch(`/api/admin/update-user-points?wallet=${searchWallet}`, {
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          alert('Usuario no encontrado');
        } else {
          throw new Error('Error al buscar usuario');
        }
        return;
      }

      const data = await response.json();
      setUserData(data);
      setNewPoints(data.total_points.toString());
    } catch (error) {
      console.error('Error:', error);
      alert('Error al buscar usuario');
    } finally {
      setLoading(false);
    }
  };

  const updatePoints = async () => {
    if (!userData || !newPoints || !reason) {
      alert('Por favor completa todos los campos');
      return;
    }

    const points = parseFloat(newPoints);
    if (isNaN(points) || points < 0) {
      alert('Los puntos deben ser un número válido mayor o igual a 0');
      return;
    }

    if (!confirm(`¿Estás seguro de cambiar los puntos de ${userData.total_points} a ${points}?`)) {
      return;
    }

    try {
      setEditing(true);
      const response = await fetch('/api/admin/update-user-points', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${address}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          walletAddress: userData.wallet_address,
          newPoints: points,
          reason
        })
      });

      if (!response.ok) {
        throw new Error('Error al actualizar puntos');
      }

      const data = await response.json();
      setUpdateSuccess(true);
      setReason('');
      
      // Recargar datos del usuario
      await searchUser();
      
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al actualizar puntos');
    } finally {
      setEditing(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleString('es-ES');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Gestión de Puntos de Usuario</h1>
          <button
            onClick={() => router.push('/admin')}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
          >
            Volver
          </button>
        </div>

        {/* Buscador */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Buscar Usuario</h2>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="0x... (wallet address)"
              value={searchWallet}
              onChange={(e) => setSearchWallet(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchUser()}
              className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={searchUser}
              disabled={loading || !searchWallet}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded-lg"
            >
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>

        {/* Datos del usuario */}
        {userData && (
          <div className="space-y-6">
            {/* Información general */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Información del Usuario</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400">Wallet</p>
                  <p className="font-mono">{userData.wallet_address}</p>
                </div>
                <div>
                  <p className="text-gray-400">Miembro desde</p>
                  <p>{formatDate(userData.created_at)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Total Check-ins</p>
                  <p className="text-xl">{userData.total_check_ins}</p>
                </div>
                <div>
                  <p className="text-gray-400">Último Check-in</p>
                  <p>{formatDate(userData.last_check_in)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Streak Actual</p>
                  <p className="text-xl">{userData.current_streak} días</p>
                </div>
                <div>
                  <p className="text-gray-400">Mejor Streak</p>
                  <p className="text-xl">{userData.max_streak} días</p>
                </div>
                <div>
                  <p className="text-gray-400">Tokens Reclamados</p>
                  <p className="text-xl">{userData.total_tokens_claimed}</p>
                </div>
              </div>
            </div>

            {/* Editor de puntos */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Editar Puntos</h2>
              
              {updateSuccess && (
                <div className="bg-green-600/20 border border-green-600 text-green-400 p-3 rounded-lg mb-4">
                  Puntos actualizados exitosamente
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 mb-2">Puntos Actuales</label>
                  <p className="text-3xl font-bold text-yellow-500">{userData.total_points}</p>
                </div>

                <div>
                  <label className="block text-gray-400 mb-2">Nuevos Puntos</label>
                  <input
                    type="number"
                    value={newPoints}
                    onChange={(e) => setNewPoints(e.target.value)}
                    min="0"
                    step="1"
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-2">Razón del cambio</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe por qué estás cambiando los puntos..."
                    rows={3}
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={updatePoints}
                  disabled={editing || !reason || newPoints === userData.total_points.toString()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded-lg"
                >
                  {editing ? 'Actualizando...' : 'Actualizar Puntos'}
                </button>
              </div>
            </div>

            {/* Historial de rewards */}
            {userData.rewards_history.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Historial de Rewards</h2>
                <div className="space-y-2">
                  {userData.rewards_history.map((reward, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-700">
                      <span>{reward.tokens_received} tokens</span>
                      <span className="text-gray-400 text-sm">
                        {formatDate(reward.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}