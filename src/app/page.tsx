'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, custom, type PublicClient } from 'viem';
import { ronin } from '@/utils/chain';
import ContractInteraction from '@/components/ContractInteraction';
import RoninWallet from '@/components/wallet-connectors/ronin-wallet/RoninWallet';
import NFTDisplay from '@/components/NFTDisplay/NFTDisplay';
import RewardsPanel from '@/components/RewardsPanel/RewardsPanel';
import HowRewardsWorks from '@/components/NFTDisplay/HowRewardsWorks';
import Navigation from '@/components/Navigation/Navigation';
import MobileMenu from '@/components/MobileMenu/MobileMenu';
import { RONIN_CHAIN_IDS } from '@/utils/contract';
import { supabase } from '@/utils/supabase';

export default function Home() {
  // Usamos any para mantener compatibilidad con componentes existentes
  const [provider, setProvider] = useState<any>(null);
  const [networkName, setNetworkName] = useState<string>('Not Connected');
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [userDataRefresh, setUserDataRefresh] = useState<number>(0);
  const [nftCalculationInProgress, setNftCalculationInProgress] = useState<boolean>(false);
  // Estado para el cliente de viem
  const [viemClient, setViemClient] = useState<PublicClient | null>(null);

  // Función para obtener el nombre de la red
  const getNetworkName = (chainId: number): string => {
    switch (chainId) {
      case RONIN_CHAIN_IDS.MAINNET:
        return 'Ronin Mainnet';
      case RONIN_CHAIN_IDS.TESTNET:
        return 'Ronin Saigon Testnet';
      default:
        return `Unknown Network (${chainId})`;
    }
  };

  // Función para conectar wallet
  const handleConnect = async (walletClient: any, publicClient: any) => {
    setProvider({
      walletClient,
      publicClient
    });
    
    // Obtener info de la red
    try {
      setViemClient(publicClient);
      
      // Obtener chainId
      const chainId = publicClient.chain.id;
      setNetworkName(getNetworkName(chainId));
      
      // Obtener dirección del usuario
      const accounts = await walletClient.getAddresses();
      if (accounts.length > 0) {
        setUserAddress(accounts[0]);
      }
    } catch (err) {
      console.error("Error getting network info:", err);
      setNetworkName('Unknown Network');
    }
  };

  // Función para desconectar wallet
  const handleDisconnect = () => {
    setProvider(null);
    setViemClient(null);
    setNetworkName('Not Connected');
    setUserAddress(null);
    setTotalPoints(0);
  };

  // Cargar datos del usuario usando la API en lugar de acceso directo a Supabase
  useEffect(() => {
    if (!userAddress) return;
    
    const loadUserData = async () => {
      try {
        const response = await fetch(`/api/user-data?wallet_address=${userAddress.toLowerCase()}`);
        const result = await response.json();
        
        if (result.error) {
          console.error('Error loading user data:', result.error);
          return;
        }
        
        if (result.data) {
          setTotalPoints(result.data.total_points || 0);
        } else {
          setTotalPoints(0);
        }
      } catch (err) {
        console.error('Error in user data fetch:', err);
        if (err instanceof Error) {
          console.error('Error details:', err.message);
        } else {
          console.error('Unexpected error format:', JSON.stringify(err));
        }
      }
    };
    
    loadUserData();
  }, [userAddress, userDataRefresh]);

  // Función para actualizar datos después de check-in
  const handleDataRefresh = () => {
    setUserDataRefresh(prev => prev + 1);
  };
  
  // Función separada para actualizar datos después de reclamar tokens
  const handleRewardClaimed = useCallback(() => {
    // Actualizar el total de puntos
    if (userAddress) {
      // Actualizar los datos de puntos
      const loadUserPoints = async () => {
        try {
          const response = await fetch(`/api/user-data?wallet_address=${userAddress.toLowerCase()}`);
          const result = await response.json();
          
          if (result.data) {
            setTotalPoints(result.data.total_points || 0);
          } else {
            setTotalPoints(0);
          }
        } catch (err) {
          console.error('Error updating points after reward claim:', err);
        }
      };
      
      loadUserPoints();
    }
  }, [userAddress]);
  
  // Memoizar la función de cambio de estado de carga para evitar bucles infinitos
  const handleNFTLoadingChange = useCallback((isLoading: boolean) => {
    console.log("Estado de carga NFT cambiado:", isLoading);
    setNftCalculationInProgress(isLoading);
  }, []);

  return (
    <div className="min-h-screen relative" style={{
      backgroundImage: "url('/images/fondomina_primos.jpeg')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed"
    }}>
      {/* Capa de blur por encima del fondo */}
      <div 
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backdropFilter: "blur(15px)",
          WebkitBackdropFilter: "blur(15px)",
          zIndex: 0
        }}
      />
      
      {/* Contenido principal (encima de la capa de blur) */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <header className="bg-gray-800 shadow relative">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              {/* Left side - Logo and Title */}
              <div className="flex items-center">
                <img 
                  src="/images/primos_logo.png" 
                  alt="Primos Logo" 
                  className="w-8 h-8 sm:w-10 sm:h-10 mr-2 sm:mr-3"
                />
                <div>
                  <h1 className="text-xl font-bold text-white uppercase">
                    Primos Daily Check-in
                  </h1>
                  <p className="text-xs text-gray-400 mt-1 hidden sm:block">
                    Earn rewards with daily check-ins
                  </p>
                </div>
              </div>

              {/* Desktop Navigation */}
              <Navigation />

              {/* Right side - Wallet and Mobile Menu */}
              <div className="flex items-center space-x-2">
                <div className="hidden md:block">
                  <RoninWallet onConnect={handleConnect} onDisconnect={handleDisconnect} />
                </div>
                <MobileMenu 
                  userAddress={userAddress} 
                  onDisconnect={handleDisconnect}
                  onConnect={handleConnect}
                />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            {provider ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <ContractInteraction 
                    walletClient={provider?.walletClient} 
                    publicClient={viemClient}
                    userAddress={userAddress}
                    onCheckInSuccess={handleDataRefresh}
                    nftCalculationInProgress={nftCalculationInProgress}
                    refreshTrigger={userDataRefresh}
                  />
                  
                  <NFTDisplay 
                    provider={provider} 
                    userAddress={userAddress}
                    refreshTrigger={userDataRefresh}
                    onLoadingStateChange={handleNFTLoadingChange}
                  />
                </div>
                
                <div>
                  <RewardsPanel 
                    userAddress={userAddress} 
                    totalPoints={totalPoints} 
                    onRewardClaimed={handleRewardClaimed} 
                    provider={provider}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-8">
                {/* Logo de Primos */}
                <div className="w-64 mx-auto">
                  <img 
                    src="/images/logo_primos_inicio.png" 
                    alt="Primos Logo" 
                    className="w-full h-auto"
                  />
                </div>
                
                {/* Mensaje de bienvenida (en inglés como solicitado) */}
                <h2 className="text-2xl font-bold text-white text-center">
                  Connect your Ronin Wallet and start earning rewards
                </h2>
                
                {/* Video con preview */}
                <div className="w-full max-w-3xl mx-auto">
                  <video 
                    src="/videos/primos_o.webm" 
                    autoPlay
                    loop
                    controls
                    muted
                    playsInline
                    className="w-full rounded-lg"
                    poster="/images/frame_primo.png"
                  />
                </div>
                
                {/* Componente How Rewards Works con texto en blanco */}
                <div className="w-full max-w-3xl mx-auto bg-gray-800 rounded-lg shadow-md p-6 text-white">
                  <HowRewardsWorks />
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="bg-gray-800 shadow mt-12">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center">
              <img 
                src="/images/logo_pimos_footer.png" 
                alt="Primos Logo" 
                style={{ width: '80px', height: 'auto' }}
                className="mb-2"
              />
              <p className="text-center text-sm text-gray-400">
                PRIMOS Daily Check-in App - {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
