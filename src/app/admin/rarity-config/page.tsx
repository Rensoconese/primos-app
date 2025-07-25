'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectorStore } from '@/hooks/useConnectorStore';

interface RarityConfig {
  id: string;
  token_id: number;
  primo_name: string;
  rarity_type: string;
  base_points: number;
  updated_at: string;
  updated_by: string;
}

const RARITY_DISPLAY_NAMES: Record<string, string> = {
  'original': 'Original',
  'original_z': 'Original Z',
  'original_z_summer': 'Original Z Summer',
  'shiny': 'Shiny',
  'shiny_z': 'Shiny Z',
  'shiny_z_summer': 'Shiny Z Summer',
  'unique': 'Unique'
};

const RARITY_COLORS: Record<string, string> = {
  'original': 'text-gray-400',
  'original_z': 'text-blue-400',
  'original_z_summer': 'text-cyan-400',
  'shiny': 'text-purple-400',
  'shiny_z': 'text-yellow-400',
  'shiny_z_summer': 'text-orange-400',
  'unique': 'text-red-400'
};

export default function RarityConfigPage() {
  const router = useRouter();
  const { account: address } = useConnectorStore();
  const [configs, setConfigs] = useState<RarityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editedPoints, setEditedPoints] = useState<Record<string, number>>({});
  const [fullSetBonus, setFullSetBonus] = useState<number>(2);
  const [editedFullSetBonus, setEditedFullSetBonus] = useState<number>(2);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (!address) {
      router.push('/admin');
      return;
    }
    fetchRarityConfigs();
  }, [address, router]);

  const fetchRarityConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/rarity-config', {
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });

      if (!response.ok) {
        throw new Error('Error al cargar configuración');
      }

      const data = await response.json();
      
      // Filtrar solo las rarezas (no el full_set)
      const rarityConfigs = data.configs.filter((c: RarityConfig) => c.rarity_type !== 'full_set');
      const fullSetConfig = data.configs.find((c: RarityConfig) => c.rarity_type === 'full_set');
      
      setConfigs(rarityConfigs);
      
      // Configurar Full Set bonus
      if (fullSetConfig) {
        setFullSetBonus(fullSetConfig.base_points);
        setEditedFullSetBonus(fullSetConfig.base_points);
      }
      
      // Inicializar editedPoints con los valores actuales
      const initialPoints: Record<string, number> = {};
      rarityConfigs.forEach((config: RarityConfig) => {
        initialPoints[config.rarity_type] = config.base_points;
      });
      setEditedPoints(initialPoints);
    } catch (error) {
      console.error('Error:', error);
      setMessage({ type: 'error', text: 'Error al cargar configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handlePointsChange = (rarityType: string, value: string) => {
    const points = parseInt(value) || 0;
    setEditedPoints(prev => ({
      ...prev,
      [rarityType]: points
    }));
  };

  const saveConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Guardar cada configuración modificada
      for (const config of configs) {
        if (editedPoints[config.rarity_type] !== config.base_points) {
          const response = await fetch('/api/admin/rarity-config', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${address}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              rarity_type: config.rarity_type,
              base_points: editedPoints[config.rarity_type]
            })
          });

          if (!response.ok) {
            throw new Error(`Error al guardar ${config.rarity_type}`);
          }
        }
      }

      // Guardar Full Set bonus si cambió
      if (editedFullSetBonus !== fullSetBonus) {
        const response = await fetch('/api/admin/rarity-config', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${address}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            rarity_type: 'full_set',
            base_points: editedFullSetBonus
          })
        });

        if (!response.ok) {
          throw new Error('Error al guardar bonus Full Set');
        }
      }

      setMessage({ type: 'success', text: 'Configuración guardada exitosamente' });
      fetchRarityConfigs(); // Recargar para obtener datos actualizados
    } catch (error) {
      console.error('Error:', error);
      setMessage({ type: 'error', text: 'Error al guardar configuración' });
    } finally {
      setSaving(false);
    }
  };

  const generatePointsMap = async () => {
    if (!confirm('¿Estás seguro de regenerar el archivo de puntos? Esto sobrescribirá el archivo actual.')) {
      return;
    }

    try {
      setGenerating(true);
      setMessage(null);

      const response = await fetch('/api/admin/generate-points-map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al generar archivo');
      }

      const data = await response.json();
      setMessage({ 
        type: 'success', 
        text: `Archivo generado exitosamente. ${data.totalNFTs} NFTs procesados.` 
      });
    } catch (error) {
      console.error('Error:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error al generar archivo' });
    } finally {
      setGenerating(false);
    }
  };

  const hasChanges = () => {
    const rarityChanges = configs.some(config => editedPoints[config.rarity_type] !== config.base_points);
    const fullSetChange = editedFullSetBonus !== fullSetBonus;
    return rarityChanges || fullSetChange;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando configuración...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Configuración de Puntos por Rareza</h1>
          <button
            onClick={() => router.push('/admin')}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
          >
            Volver
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-800' : 'bg-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-6">Puntos Base por Tipo de Rareza</h2>
          
          <div className="space-y-4">
            {configs.map((config) => (
              <div key={config.id} className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-4">
                  <span className={`text-lg font-medium ${RARITY_COLORS[config.rarity_type]}`}>
                    {RARITY_DISPLAY_NAMES[config.rarity_type]}
                  </span>
                </div>
                
                <div className="flex items-center space-x-4">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedPoints[config.rarity_type] || 0}
                    onChange={(e) => handlePointsChange(config.rarity_type, e.target.value)}
                    className="w-20 bg-gray-600 text-white px-3 py-2 rounded text-center"
                  />
                  <span className="text-gray-400">puntos</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-sm text-gray-400">
            <p>Última actualización: {configs[0]?.updated_at ? new Date(configs[0].updated_at).toLocaleString() : 'N/A'}</p>
            <p>Por: {configs[0]?.updated_by?.slice(0, 6)}...</p>
          </div>
        </div>

        {/* Sección separada para Full Set Bonus */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Configuración de Traits Especiales</h2>
          
          <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-4">
              <span className="text-lg font-medium text-green-400">
                Full Set (Trait Bonus)
              </span>
              <span className="text-sm text-gray-400">
                Se suma a cualquier rareza que tenga este trait
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-gray-400">+</span>
              <input
                type="number"
                min="0"
                max="10"
                value={editedFullSetBonus}
                onChange={(e) => setEditedFullSetBonus(parseInt(e.target.value) || 0)}
                className="w-20 bg-gray-600 text-white px-3 py-2 rounded text-center"
              />
              <span className="text-gray-400">puntos adicionales</span>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-gray-500">
            <p>Ejemplo: Un "Shiny" (7 puntos) con Full Set = 7 + {editedFullSetBonus} = {7 + editedFullSetBonus} puntos totales</p>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={saveConfig}
            disabled={saving || !hasChanges()}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              hasChanges() 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-600 cursor-not-allowed'
            }`}
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>

          <button
            onClick={generatePointsMap}
            disabled={generating || hasChanges()}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              !hasChanges()
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-600 cursor-not-allowed'
            }`}
            title={hasChanges() ? 'Guarda los cambios primero' : ''}
          >
            {generating ? 'Generando...' : 'Regenerar Mapa de Puntos'}
          </button>
        </div>

        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">Información Importante</h3>
          <ul className="space-y-2 text-gray-400">
            <li>• Los cambios en los puntos no afectan hasta regenerar el mapa</li>
            <li>• El archivo de puntos contiene los ~3000 NFTs con sus puntos asignados</li>
            <li>• Regenerar el mapa puede tomar varios segundos</li>
            <li>• Los cambios afectarán los próximos check-ins de los usuarios</li>
          </ul>
        </div>
      </div>
    </div>
  );
}