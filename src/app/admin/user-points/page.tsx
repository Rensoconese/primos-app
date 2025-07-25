'use client';

import { useState } from 'react';

export default function UserPointsAdmin() {
  const [walletAddress, setWalletAddress] = useState('');
  const [points, setPoints] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpdatePoints = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/update-user-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress.toLowerCase(),
          points: parseInt(points),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ Puntos actualizados exitosamente: ${data.message}`);
        setWalletAddress('');
        setPoints('');
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6">Actualizar Puntos de Usuario</h2>
        
        <form onSubmit={handleUpdatePoints} className="space-y-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Dirección de Wallet
            </label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Puntos (número positivo para sumar, negativo para restar)
            </label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="100"
              className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {isLoading ? 'Actualizando...' : 'Actualizar Puntos'}
          </button>
        </form>

        {message && (
          <div className="mt-4 p-3 rounded-lg bg-white/20 text-white">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}