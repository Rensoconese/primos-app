'use client';

import { useRouter } from 'next/navigation';
import { useConnectorStore } from '@/hooks/useConnectorStore';

export default function AdminPage() {
  const router = useRouter();
  const { account: address } = useConnectorStore();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Panel de Administración</h1>
        <div className="text-gray-400">
          Conectado como: {address?.slice(0, 6)}...{address?.slice(-4)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Claims Pendientes */}
        <div 
          onClick={() => router.push('/admin/pending-claims')}
          className="bg-gray-800 rounded-lg p-6 cursor-pointer hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-xl font-semibold text-white mb-2">Claims Pendientes</h2>
          <p className="text-gray-400">Gestionar claims de tokens fallidos</p>
        </div>

        {/* Gestión de Puntos */}
        <div 
          onClick={() => router.push('/admin/user-points')}
          className="bg-gray-800 rounded-lg p-6 cursor-pointer hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-xl font-semibold text-white mb-2">Gestión de Puntos</h2>
          <p className="text-gray-400">Editar puntos de usuarios</p>
        </div>

        {/* Configuración de Rareza */}
        <div 
          onClick={() => router.push('/admin/rarity-config')}
          className="bg-gray-800 rounded-lg p-6 cursor-pointer hover:bg-gray-700 transition-colors border-2 border-green-600"
        >
          <h2 className="text-xl font-semibold text-white mb-2">Configuración de Rareza</h2>
          <p className="text-gray-400">Editar puntos por tipo de rareza y regenerar mapa</p>
          <p className="text-green-400 text-sm mt-2">⚡ Recomendado</p>
        </div>
      </div>
    </div>
  );
}