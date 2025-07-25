'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Configuración optimizada para reducir requests
            staleTime: 60 * 1000, // Los datos se consideran frescos por 1 minuto
            gcTime: 5 * 60 * 1000, // Cache por 5 minutos (antes era cacheTime)
            retry: 3, // Reintentar 3 veces en caso de error
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
            refetchOnWindowFocus: false, // No refetch al cambiar de ventana
            refetchOnReconnect: 'always', // Refetch al reconectar
          },
          mutations: {
            retry: 1, // Solo 1 reintento para mutaciones
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}