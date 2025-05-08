'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface NFTListing {
  tokenId: string;
  contractAddress: string;
  seller: string;
  price: string;
  timestamp: string;
  listingUrl: string;
  image?: string;
  name?: string;
}

export default function MarketplaceListings() {
  const [listings, setListings] = useState<NFTListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchListings = async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = refresh 
        ? '/api/marketplace-listings?refresh=true' 
        : '/api/marketplace-listings';
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setListings(data.listings || []);
      setLastUpdated(data.timestamp || new Date().toISOString());
    } catch (err: any) {
      console.error('Error fetching marketplace listings:', err);
      setError(err.message || 'Error al cargar los listados del marketplace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const handleRefresh = () => {
    fetchListings(true);
  };

  // Formatear la dirección para mostrar
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Formatear la fecha
  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return timestamp;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">NFTs de Primos Listados en el Marketplace</h2>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center"
        >
          {loading ? (
            <span>Actualizando...</span>
          ) : (
            <span>Actualizar Listados</span>
          )}
        </button>
      </div>

      {lastUpdated && (
        <p className="text-sm text-gray-500 mb-4">
          Última actualización: {formatDate(lastUpdated)}
        </p>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No hay NFTs listados actualmente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing) => (
            <div key={`${listing.contractAddress}-${listing.tokenId}`} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="relative h-48 bg-gray-200">
                {listing.image ? (
                  <Image
                    src={listing.image}
                    alt={listing.name || `Primo #${listing.tokenId}`}
                    fill
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-gray-400">Sin imagen</span>
                  </div>
                )}
                <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded-md text-sm font-bold">
                  {listing.price}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg mb-2">{listing.name || `Primo #${listing.tokenId}`}</h3>
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-semibold">Token ID:</span> {listing.tokenId}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-semibold">Vendedor:</span> {formatAddress(listing.seller)}
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  <span className="font-semibold">Listado:</span> {formatDate(listing.timestamp)}
                </p>
                <a
                  href={listing.listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-md transition-colors"
                >
                  Ver en Marketplace
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
