'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RoninWallet from '@/components/wallet-connectors/ronin-wallet/RoninWallet';

export default function AdminNavbar() {
  const router = useRouter();

  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Title */}
          <div className="flex items-center space-x-4">
            <Link href="/admin" className="text-xl font-bold text-white hover:text-gray-300">
              Admin Panel
            </Link>
            
            {/* Navigation Links */}
            <div className="flex space-x-4">
              <Link 
                href="/admin/pending-claims" 
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Claims
              </Link>
              <Link 
                href="/admin/user-points" 
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Puntos
              </Link>
              <Link 
                href="/admin/rarity-config" 
                className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                Configurar Rareza
              </Link>
            </div>
          </div>

          {/* Right side - Wallet Connection */}
          <div className="flex items-center space-x-4">
            <RoninWallet />
            
            <button
              onClick={() => router.push('/')}
              className="text-gray-400 hover:text-white text-sm"
            >
              ← Volver al App
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}