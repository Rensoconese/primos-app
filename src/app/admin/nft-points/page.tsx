'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectorStore } from '@/hooks/useConnectorStore';
import { NFT_POINTS } from '@/data/nftPoints';

interface PointsStats {
  totalNFTs: number;
  pointsDistribution: Record<string, number>;
  rarityStats: Record<string, { count: number; totalPoints: number }>;
  sampleNFTs: Array<{ id: string; points: number }>;
}

const RARITY_COLORS: Record<string, string> = {
  '1': 'text-gray-400',    // Original (1-2 points)
  '2': 'text-gray-400',    // Original
  '4': 'text-blue-400',    // Original Z
  '6': 'text-blue-400',    // Original Z + Full Set
  '7': 'text-purple-400',  // Shiny
  '9': 'text-purple-400',  // Shiny + Full Set
  '13': 'text-yellow-400', // Shiny Z
  '15': 'text-yellow-400', // Shiny Z + Full Set
  '30': 'text-red-400',    // Unique
  '32': 'text-red-400',    // Unique + Full Set
};

export default function NFTPointsPage() {
  const router = useRouter();
  const { account: address } = useConnectorStore();
  const [stats, setStats] = useState<PointsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPoints, setSelectedPoints] = useState<string>('all');

  useEffect(() => {
    if (!address) {
      router.push('/admin');
      return;
    }
    calculateStats();
  }, [address, router]);

  const calculateStats = () => {
    setLoading(true);
    
    const pointsDistribution: Record<string, number> = {};
    const rarityStats: Record<string, { count: number; totalPoints: number }> = {};
    
    // Analizar todos los NFTs
    Object.entries(NFT_POINTS).forEach(([tokenId, points]) => {
      // Distribución de puntos
      const pointsKey = points.toString();
      pointsDistribution[pointsKey] = (pointsDistribution[pointsKey] || 0) + 1;
      
      // Estadísticas por "rareza" (agrupando por puntos)
      if (!rarityStats[pointsKey]) {
        rarityStats[pointsKey] = { count: 0, totalPoints: 0 };
      }
      rarityStats[pointsKey].count++;
      rarityStats[pointsKey].totalPoints += points;
    });

    // Muestra de NFTs (primeros 50)
    const sampleNFTs = Object.entries(NFT_POINTS)
      .slice(0, 50)
      .map(([id, points]) => ({ id, points }));

    setStats({
      totalNFTs: Object.keys(NFT_POINTS).length,
      pointsDistribution,
      rarityStats,
      sampleNFTs
    });
    
    setLoading(false);
  };

  const getFilteredNFTs = () => {
    if (!stats) return [];
    
    return Object.entries(NFT_POINTS)
      .filter(([tokenId, points]) => {
        const matchesSearch = searchTerm === '' || tokenId.includes(searchTerm);
        const matchesPoints = selectedPoints === 'all' || points.toString() === selectedPoints;
        return matchesSearch && matchesPoints;
      })
      .slice(0, 100); // Limitar a 100 para performance
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Analizando puntos de NFTs...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">Error al cargar datos</div>
      </div>
    );
  }

  const filteredNFTs = getFilteredNFTs();

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Puntos de NFTs Generados</h1>
          <button
            onClick={() => router.push('/admin')}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
          >
            Volver
          </button>
        </div>

        {/* Estadísticas Generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Total NFTs</h3>
            <p className="text-3xl font-bold text-green-400">{stats.totalNFTs}</p>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Tipos de Puntos</h3>
            <p className="text-3xl font-bold text-blue-400">
              {Object.keys(stats.pointsDistribution).length}
            </p>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Puntos Máximos</h3>
            <p className="text-3xl font-bold text-red-400">
              {Math.max(...Object.keys(stats.pointsDistribution).map(Number))}
            </p>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Puntos Mínimos</h3>
            <p className="text-3xl font-bold text-gray-400">
              {Math.min(...Object.keys(stats.pointsDistribution).map(Number))}
            </p>
          </div>
        </div>

        {/* Distribución de Puntos */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6">Distribución de Puntos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(stats.pointsDistribution)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([points, count]) => (
                <div key={points} className="bg-gray-700 rounded-lg p-4 text-center">
                  <div className={`text-2xl font-bold ${RARITY_COLORS[points] || 'text-white'}`}>
                    {points}
                  </div>
                  <div className="text-sm text-gray-400">puntos</div>
                  <div className="text-lg font-semibold">{count}</div>
                  <div className="text-xs text-gray-500">NFTs</div>
                </div>
            ))}
          </div>
        </div>

        {/* Filtros y Búsqueda */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Buscar NFTs Específicos</h2>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              placeholder="Buscar por Token ID (ej: 2228)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg"
            />
            <select
              value={selectedPoints}
              onChange={(e) => setSelectedPoints(e.target.value)}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              <option value="all">Todos los puntos</option>
              {Object.keys(stats.pointsDistribution)
                .sort((a, b) => Number(a) - Number(b))
                .map(points => (
                  <option key={points} value={points}>{points} puntos</option>
              ))}
            </select>
          </div>
          
          {/* Lista de NFTs */}
          <div className="max-h-96 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {filteredNFTs.map(([tokenId, points]) => (
                <div key={tokenId} className="bg-gray-700 rounded p-2 text-center">
                  <div className="text-sm font-medium">#{tokenId}</div>
                  <div className={`text-lg font-bold ${RARITY_COLORS[points.toString()] || 'text-white'}`}>
                    {points}
                  </div>
                </div>
              ))}
            </div>
            {filteredNFTs.length === 100 && (
              <div className="text-center mt-4 text-gray-400">
                Mostrando primeros 100 resultados...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}