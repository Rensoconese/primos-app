'use client';

import { useState, useEffect } from 'react';

interface RarityConfig {
  rarity: string;
  points: number;
}

export default function RarityConfigAdmin() {
  const [configs, setConfigs] = useState<RarityConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/admin/rarity-config');
      const data = await response.json();
      
      if (response.ok) {
        setConfigs(data.configs || []);
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = async (rarity: string, points: number) => {
    try {
      const response = await fetch('/api/admin/rarity-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rarity, points }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ Configuración actualizada: ${rarity} = ${points} puntos`);
        fetchConfigs(); // Reload data
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  if (isLoading) {
    return <div className="text-white text-center">Cargando configuración...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6">Configuración de Puntos por Rareza</h2>
        
        {message && (
          <div className="mb-4 p-3 rounded-lg bg-white/20 text-white">
            {message}
          </div>
        )}

        <div className="space-y-4">
          {configs.map((config) => (
            <div key={config.rarity} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
              <div className="text-white">
                <span className="font-medium capitalize">{config.rarity}</span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  defaultValue={config.points}
                  onBlur={(e) => {
                    const newPoints = parseInt(e.target.value);
                    if (newPoints !== config.points && !isNaN(newPoints)) {
                      updateConfig(config.rarity, newPoints);
                    }
                  }}
                  className="w-20 px-2 py-1 bg-white/20 border border-white/30 rounded text-white text-center"
                />
                <span className="text-gray-300">puntos</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-blue-500/20 rounded-lg">
          <h3 className="text-white font-medium mb-2">Instrucciones:</h3>
          <p className="text-gray-300 text-sm">
            Modifica los valores y presiona Enter o haz click fuera del campo para guardar los cambios.
            Los cambios se aplicarán inmediatamente a todos los nuevos cálculos de puntos.
          </p>
        </div>
      </div>
    </div>
  );
}