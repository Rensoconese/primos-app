'use client';

import { useEffect, useState } from 'react';
import { useConnectorStore } from '@/hooks/useConnectorStore';
import { useRouter } from 'next/navigation';
import { isAdminWallet } from '@/config/admin';
import RoninWallet from '@/components/wallet-connectors/ronin-wallet/RoninWallet';

interface AdminGuardProps {
  children: React.ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const { account, isConnected } = useConnectorStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Pequeño delay para evitar flash de contenido
    const timer = setTimeout(() => {
      setIsChecking(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Si está conectado pero no es admin, mostrar error
    if (isConnected && account && !isAdminWallet(account)) {
      console.log('Wallet conectada no es admin:', account);
    }
  }, [account, isConnected]);

  // Loading inicial
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  // Si no está conectado, mostrar mensaje
  if (!isConnected || !account) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <svg 
            className="mx-auto h-16 w-16 text-gray-600 mb-4" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
            />
          </svg>
          <h2 className="text-2xl font-bold text-white mb-2">
            Conecta tu Wallet
          </h2>
          <p className="text-gray-400 mb-6">
            Necesitas conectar tu Ronin Wallet para acceder al panel de administración
          </p>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 inline-block">
            <RoninWallet />
          </div>
        </div>
      </div>
    );
  }

  // Si está conectado pero no es admin
  if (!isAdminWallet(account)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="max-w-md w-full bg-gray-800 shadow-xl rounded-lg p-8">
          <div className="text-center">
            <svg 
              className="mx-auto h-12 w-12 text-red-500 mb-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" 
              />
            </svg>
            <h2 className="text-2xl font-bold text-white mb-2">
              Acceso Denegado
            </h2>
            <p className="text-gray-400 mb-4">
              Tu wallet no está autorizada para acceder al panel de administración.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Wallet conectada:
              <br />
              <span className="font-mono text-red-400">
                {account}
              </span>
            </p>
            <button
              onClick={() => router.push('/')}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Es admin - mostrar contenido
  return <>{children}</>;
}