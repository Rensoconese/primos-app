'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectorStore } from '@/hooks/useConnectorStore';
import { isAdminWallet } from '@/config/admin';

// Mapeo de rarezas disponibles
const RARITY_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: 'original z', label: 'Original Z' },
  { value: 'original z summer', label: 'Original Z Summer' },
  { value: 'shiny', label: 'Shiny' },
  { value: 'shiny z', label: 'Shiny Z' },
  { value: 'shiny z summer', label: 'Shiny Z Summer' },
  { value: 'unique', label: 'Unique' }
];

export default function UpdateRarityPage() {
  const router = useRouter();
  const { account: address } = useConnectorStore();
  const [tokenId, setTokenId] = useState('');
  const [selectedRarity, setSelectedRarity] = useState('original');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const isAdmin = isAdminWallet(address);

  const handleUpdate = async () => {
    if (!tokenId) {
      setError('Por favor ingresa un Token ID');
      return;
    }

    const id = parseInt(tokenId);
    if (isNaN(id) || id < 1 || id > 3000) {
      setError('Token ID debe ser un número entre 1 y 3000');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/admin/update-nft-rarity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${address}`
        },
        body: JSON.stringify({
          tokenId: id,
          newRarity: selectedRarity
        })
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        setTokenId(''); // Limpiar el input
      } else {
        setError(data.error || 'Error al actualizar');
      }
    } catch (err: any) {
      setError('Error de conexión: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Acceso Denegado</h2>
          <p className="text-gray-400">No tienes permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Actualizar Rareza Individual</h1>
        <button
          onClick={() => router.push('/admin')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          Volver al Panel
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg p-8 max-w-2xl mx-auto">
        <div className="space-y-6">
          {/* Input Token ID */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              NFT Token ID
            </label>
            <input
              type="number"
              min="1"
              max="3000"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder="Ej: 398"
              className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
              disabled={isLoading}
            />
            <p className="text-gray-400 text-sm mt-1">Ingresa el ID del NFT a actualizar (1-3000)</p>
          </div>

          {/* Select Rareza */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Nueva Rareza
            </label>
            <select
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
              disabled={isLoading}
            >
              {RARITY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Botón Actualizar */}
          <button
            onClick={handleUpdate}
            disabled={isLoading || !tokenId}
            className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
              isLoading || !tokenId
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
            }`}
          >
            {isLoading ? 'Actualizando...' : 'Actualizar Rareza'}
          </button>

          {/* Mensajes de Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
              <p className="text-red-500">{error}</p>
            </div>
          )}

          {/* Resultado Exitoso */}
          {result && (
            <div className="bg-green-500/10 border border-green-500 rounded-lg p-4 space-y-2">
              <p className="text-green-500 font-semibold">✅ {result.message}</p>
              <div className="text-gray-300 space-y-1">
                <p>• NFT #{result.tokenId}</p>
                <p>• {result.oldRarity} → {result.newRarity}</p>
                {result.githubCommit && (
                  <p className="text-xs">
                    • Commit: {' '}
                    <a 
                      href={result.commitUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {result.githubCommit.slice(0, 7)}
                    </a>
                  </p>
                )}
                {result.unchanged && (
                  <p className="text-yellow-400 text-sm mt-2">
                    ℹ️ El NFT ya tenía esta rareza
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notas */}
        <div className="mt-8 pt-8 border-t border-gray-700">
          <h3 className="text-lg font-semibold text-gray-300 mb-3">Notas importantes:</h3>
          <ul className="space-y-2 text-gray-400 text-sm">
            <li>• Este cambio modifica directamente el archivo nftMappings.ts en GitHub</li>
            <li>• Los cambios son inmediatos y se reflejarán en el próximo check-in</li>
            <li>• Para aplicar los puntos, ejecuta "Regenerar Mapa de Puntos" en Configuración de Rareza</li>
            <li>• Cada cambio genera un commit individual en GitHub para trazabilidad</li>
          </ul>
        </div>
      </div>
    </div>
  );
}