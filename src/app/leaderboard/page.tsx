'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, custom, type PublicClient } from 'viem';
import { ronin } from '@/utils/chain';
import RoninWallet from '@/components/wallet-connectors/ronin-wallet/RoninWallet';
import Navigation from '@/components/Navigation/Navigation';
import MobileMenu from '@/components/MobileMenu/MobileMenu';
import LeaderboardDisplay from '@/components/LeaderboardDisplay/LiderboardDisplay';
import { RONIN_CHAIN_IDS } from '@/utils/contract';

export default function LeaderboardPage() {
  const [provider, setProvider] = useState<any>(null);
  const [networkName, setNetworkName] = useState<string>('Not Connected');
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [viemClient, setViemClient] = useState<PublicClient | null>(null);

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

  const handleConnect = async (walletClient: any, publicClient: any) => {
    setProvider({
      walletClient,
      publicClient
    });
    
    try {
      setViemClient(publicClient);
      const chainId = publicClient.chain.id;
      setNetworkName(getNetworkName(chainId));
      
      const accounts = await walletClient.getAddresses();
      if (accounts.length > 0) {
        setUserAddress(accounts[0]);
      }
    } catch (err) {
      console.error("Error getting network info:", err);
      setNetworkName('Unknown Network');
    }
  };

  const handleDisconnect = () => {
    setProvider(null);
    setViemClient(null);
    setNetworkName('Not Connected');
    setUserAddress(null);
  };

  return (
    <div className="min-h-screen relative" style={{
      backgroundImage: "url('/images/fondomina_primos.jpeg')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed"
    }}>
      {/* Contenido principal */}
      <div className="relative">
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
                <RoninWallet onConnect={handleConnect} onDisconnect={handleDisconnect} />
                <MobileMenu />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-white uppercase">Global Leaderboard</h2>
              <p className="text-gray-300 mt-2">Compete with other primo miners and climb the ranks!</p>
            </div>
            
            {/* Leaderboard sin refreshTrigger */}
            <LeaderboardDisplay />
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