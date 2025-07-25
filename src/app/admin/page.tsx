'use client';

import Link from 'next/link';

export default function AdminDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Link 
        href="/admin/user-points"
        className="bg-white/10 backdrop-blur-sm rounded-lg p-6 hover:bg-white/20 transition-all duration-300 border border-white/20"
      >
        <div className="text-white">
          <h2 className="text-xl font-semibold mb-2">Gestión de Puntos</h2>
          <p className="text-gray-300">Actualizar puntos de usuarios manualmente</p>
        </div>
      </Link>

      <Link 
        href="/admin/rarity-config"
        className="bg-white/10 backdrop-blur-sm rounded-lg p-6 hover:bg-white/20 transition-all duration-300 border border-white/20"
      >
        <div className="text-white">
          <h2 className="text-xl font-semibold mb-2">Configuración de Rareza</h2>
          <p className="text-gray-300">Gestionar puntos por rareza de NFTs</p>
        </div>
      </Link>

      <Link 
        href="/admin/pending-claims"
        className="bg-white/10 backdrop-blur-sm rounded-lg p-6 hover:bg-white/20 transition-all duration-300 border border-white/20"
      >
        <div className="text-white">
          <h2 className="text-xl font-semibold mb-2">Claims Pendientes</h2>
          <p className="text-gray-300">Revisar y procesar reclamaciones</p>
        </div>
      </Link>
    </div>
  );
}