'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectorStore } from '@/hooks/useConnectorStore';

interface PendingClaim {
  id: string;
  wallet_address: string;
  amount: number;
  points_to_deduct: number;
  status: string;
  error_details?: string;
  created_at: string;
  admin_notes?: string;
  admin_processed_by?: string;
  users?: {
    wallet_address: string;
    total_points: number;
    current_streak: number;
  };
}

interface ClaimsStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export default function PendingClaimsPage() {
  const router = useRouter();
  const { account: address } = useConnectorStore();
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [stats, setStats] = useState<ClaimsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState('pending');
  const [adminNotes, setAdminNotes] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (!address) {
      router.push('/admin');
      return;
    }
    fetchClaims();
  }, [address, filter, router]);

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/pending-claims?status=${filter}`, {
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });

      if (!response.ok) {
        throw new Error('Error al cargar claims');
      }

      const data = await response.json();
      setClaims(data.claims);
      setStats(data.stats);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const processClaim = async (claimId: string) => {
    if (!confirm('¿Estás seguro de procesar este claim?')) return;

    try {
      setProcessing(claimId);
      const response = await fetch('/api/admin/process-claim', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${address}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          claimId,
          adminNotes: adminNotes[claimId] || ''
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Claim procesado exitosamente. TX: ${data.txHash}`);
        fetchClaims();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al procesar claim');
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-500';
      case 'processing': return 'text-blue-500';
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'cancelled': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando claims pendientes...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Claims Pendientes</h1>
          <button
            onClick={() => router.push('/admin')}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
          >
            Volver
          </button>
        </div>

        {/* Estadísticas */}
        {stats && (
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
              <div className="text-sm text-gray-400">Pendientes</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.processing}</div>
              <div className="text-sm text-gray-400">Procesando</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
              <div className="text-sm text-gray-400">Completados</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
              <div className="text-sm text-gray-400">Fallidos</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-500">{stats.cancelled}</div>
              <div className="text-sm text-gray-400">Cancelados</div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded ${filter === 'pending' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Pendientes
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`px-4 py-2 rounded ${filter === 'failed' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Fallidos
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded ${filter === 'completed' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            Completados
          </button>
        </div>

        {/* Lista de claims */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">Wallet</th>
                <th className="px-4 py-3 text-left">Tokens</th>
                <th className="px-4 py-3 text-left">Puntos</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Error</th>
                <th className="px-4 py-3 text-left">Notas</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-t border-gray-700">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-mono text-sm">
                        {claim.wallet_address.slice(0, 6)}...{claim.wallet_address.slice(-4)}
                      </div>
                      {claim.users && (
                        <div className="text-xs text-gray-400">
                          Puntos: {claim.users.total_points} | Streak: {claim.users.current_streak}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{claim.amount}</td>
                  <td className="px-4 py-3">{claim.points_to_deduct}</td>
                  <td className="px-4 py-3">
                    <span className={getStatusColor(claim.status)}>
                      {claim.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatDate(claim.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {claim.error_details && (
                      <div className="text-xs text-red-400 max-w-xs truncate" title={claim.error_details}>
                        {claim.error_details}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {claim.status === 'pending' ? (
                      <input
                        type="text"
                        placeholder="Notas..."
                        value={adminNotes[claim.id] || ''}
                        onChange={(e) => setAdminNotes({
                          ...adminNotes,
                          [claim.id]: e.target.value
                        })}
                        className="bg-gray-700 px-2 py-1 rounded text-sm w-32"
                      />
                    ) : (
                      <div className="text-xs">
                        {claim.admin_notes}
                        {claim.admin_processed_by && (
                          <div className="text-gray-500">
                            Por: {claim.admin_processed_by.slice(0, 6)}...
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {claim.status === 'pending' && (
                      <button
                        onClick={() => processClaim(claim.id)}
                        disabled={processing === claim.id}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-1 rounded text-sm"
                      >
                        {processing === claim.id ? 'Procesando...' : 'Procesar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {claims.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              No hay claims {filter !== 'all' ? filter : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}