'use client';

import { useState, useEffect, useCallback } from 'react';
import { createWalletClient, createPublicClient, custom, http, type WalletClient, type PublicClient } from 'viem';
import { useConnectorStore } from '@/hooks/useConnectorStore';
import { ronin } from '@/utils/chain';

// Tipos para window.ronin
declare global {
  interface Window {
    ronin?: {
      provider: any;
    };
  }
}

interface RoninWalletProps {
  onConnect?: (walletClient: WalletClient, publicClient: PublicClient) => void;
  onDisconnect?: () => void;
}

const RoninWallet: React.FC<RoninWalletProps> = ({ onConnect, onDisconnect }) => {
  const { 
    isConnected, 
    setIsConnected, 
    account, 
    setAccount, 
    chainId, 
    setChainId, 
    client, 
    setClient 
  } = useConnectorStore();
  
  const [connecting, setConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [publicClient, setPublicClient] = useState<PublicClient | null>(null);

  // Verificar si Ronin Wallet está instalado
  const isRoninWalletInstalled = (): boolean => {
    return typeof window !== 'undefined' && typeof window.ronin !== 'undefined';
  };

  // Conectar wallet
  const connectWallet = async () => {
    setConnecting(true);
    setError(null);
    
    if (!isRoninWalletInstalled()) {
      setError('Ronin Wallet is not installed');
      window.open('https://wallet.roninchain.com/', '_blank');
      setConnecting(false);
      return;
    }
    
    try {
      // Crear el cliente Viem para wallet
      const walletClient = createWalletClient({
        chain: ronin,
        transport: custom(window.ronin!.provider)
      });
      
      // Crear el cliente público
      const newPublicClient = createPublicClient({
        chain: ronin,
        transport: custom(window.ronin!.provider)
      });
      
      // Solicitar acceso a las cuentas
      const addresses = await walletClient.requestAddresses();
      
      if (addresses.length > 0) {
        const address = addresses[0];
        setAccount(address);
        setClient(walletClient);
        setPublicClient(newPublicClient);
        setIsConnected(true);
        
        // Obtener chainId
        try {
          const chainIdHex = await window.ronin!.provider.request({ method: 'eth_chainId' });
          const chainIdNum = parseInt(chainIdHex, 16);
          setChainId(chainIdNum);
        } catch (chainErr) {
          console.error('Error getting chainId:', chainErr);
          // Usar el chainId de Ronin por defecto
          setChainId(2020);
        }
        
        // Llamar al callback onConnect con los clientes viem
        if (onConnect) {
          try {
            onConnect(walletClient, newPublicClient);
          } catch (providerErr) {
            console.error('Error calling onConnect:', providerErr);
          }
        }
      } else {
        setError('Could not get wallet address');
      }
    } catch (err) {
      console.error('Error connecting to wallet:', err);
      setError('Error connecting to wallet');
    } finally {
      setConnecting(false);
    }
  };
  
  // Desconectar wallet
  const disconnectWallet = async () => {
    try {
      // Intentar desconectar si la wallet lo soporta
      if (isRoninWalletInstalled() && typeof window.ronin!.provider.disconnect === 'function') {
        await window.ronin!.provider.disconnect();
      }
      
      setIsConnected(false);
      setAccount(null);
      setClient(null);
      setPublicClient(null);
      
      if (onDisconnect) {
        onDisconnect();
      }
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
    }
  };

  // Configurar listeners para eventos de la wallet
  useEffect(() => {
    if (!isRoninWalletInstalled()) return;
    
    const handleAccountsChanged = (accounts: string[]) => {
      console.log('Accounts changed:', accounts);
      
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        
        // Si ya estaba conectado, actualizar los clientes viem
        if (isConnected && client && publicClient && onConnect) {
          try {
            onConnect(client, publicClient);
          } catch (err) {
            console.error('Error updating clients after account change:', err);
          }
        }
      } else {
        // No hay cuentas, desconectar
        setIsConnected(false);
        setAccount(null);
        
        if (onDisconnect) {
          onDisconnect();
        }
      }
    };
    
    const handleChainChanged = (chainIdHex: string) => {
      console.log('Chain changed:', chainIdHex);
      const chainIdNum = parseInt(chainIdHex, 16);
      setChainId(chainIdNum);
      
      // Actualizar los clientes viem
      if (isConnected && client && publicClient && onConnect) {
        try {
          onConnect(client, publicClient);
        } catch (err) {
          console.error('Error updating clients after chain change:', err);
        }
      }
    };
    
    const handleDisconnect = () => {
      console.log('Disconnect event received');
      setIsConnected(false);
      setAccount(null);
      
      if (onDisconnect) {
        onDisconnect();
      }
    };
    
    // Registrar listeners
    window.ronin!.provider.on('accountsChanged', handleAccountsChanged);
    window.ronin!.provider.on('chainChanged', handleChainChanged);
    window.ronin!.provider.on('disconnect', handleDisconnect);
    
    // Cleanup
    return () => {
      if (isRoninWalletInstalled()) {
        window.ronin!.provider.off('accountsChanged', handleAccountsChanged);
        window.ronin!.provider.off('chainChanged', handleChainChanged);
        window.ronin!.provider.off('disconnect', handleDisconnect);
      }
    };
  }, [onConnect, onDisconnect, isConnected, client, publicClient]);
  
  // Verificar si ya hay una cuenta conectada (separado del useEffect de los listeners)
  useEffect(() => {
    if (!isRoninWalletInstalled()) return;
    
    // Solo ejecutar una vez al montar el componente
    const checkExistingConnection = async () => {
      try {
        const accounts = await window.ronin!.provider.request({ method: 'eth_accounts' });
        
        if (accounts && accounts.length > 0) {
          // Crear los clientes viem
          const walletClient = createWalletClient({
            chain: ronin,
            transport: custom(window.ronin!.provider)
          });
          
          const newPublicClient = createPublicClient({
            chain: ronin,
            transport: custom(window.ronin!.provider)
          });
          
          setAccount(accounts[0]);
          setClient(walletClient);
          setPublicClient(newPublicClient);
          setIsConnected(true);
          
          // Obtener chainId
          try {
            const chainIdHex = await window.ronin!.provider.request({ method: 'eth_chainId' });
            const chainIdNum = parseInt(chainIdHex, 16);
            setChainId(chainIdNum);
            
            // Llamar al callback onConnect con los clientes viem
            if (onConnect) {
              onConnect(walletClient, newPublicClient);
            }
          } catch (chainErr) {
            console.error('Error getting chainId:', chainErr);
            setChainId(2020); // Usar el chainId de Ronin por defecto
          }
        }
      } catch (err) {
        console.error('Error checking existing connection:', err);
      }
    };
    
    checkExistingConnection();
    // Este efecto solo se ejecuta una vez al montar el componente
  }, []);

  return (
    <div className={'flex flex-col justify-center'}>
      {!isConnected ? (
        <>
          <button 
            onClick={connectWallet} 
            disabled={connecting}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-blue-300"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          
          {error && (
            <div className="mt-2 p-2 bg-red-100 text-red-700 rounded-md text-sm absolute right-0 mt-8">
              {error}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="text-sm font-medium px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-600">
            {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Unknown'}
          </div>
          <button
            onClick={disconnectWallet}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default RoninWallet;
