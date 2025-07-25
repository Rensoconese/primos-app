'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Solo capturar errores que no sean de MetaMask/wallet
    if (!error.message?.includes('MetaMask') && 
        !error.message?.includes('disconnect') &&
        !error.message?.includes('wallet')) {
      Sentry.captureException(error);
    }
  }, [error]);

  // Determinar si es un error de wallet
  const isWalletError = error.message?.includes('MetaMask') || 
                       error.message?.includes('disconnect') ||
                       error.message?.includes('wallet') ||
                       error.message?.includes('ronin');

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="text-center p-8 max-w-md">
            {isWalletError ? (
              <>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Problema de conexión con la wallet
                </h2>
                <p className="text-gray-400 mb-6">
                  Esta aplicación requiere Ronin Wallet para funcionar correctamente.
                </p>
                <div className="space-y-4">
                  <a
                    href="https://wallet.roninchain.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Instalar Ronin Wallet
                  </a>
                  <button
                    onClick={reset}
                    className="block w-full px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white mb-4">
                  ¡Algo salió mal!
                </h2>
                <p className="text-gray-400 mb-6">
                  Ocurrió un error inesperado. Nuestro equipo ha sido notificado.
                </p>
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                >
                  Intentar de nuevo
                </button>
              </>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}