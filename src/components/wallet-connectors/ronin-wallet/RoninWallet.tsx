'use client';

import { ConnectorEvent, IConnectResult, requestRoninWalletConnector } from '@sky-mavis/tanto-connect';
import { ethers } from 'ethers';
import { isNil } from 'lodash';
import React, { FC, useEffect } from 'react';

import { useConnectorStore } from '../../../hooks/useConnectorStore';
import WillRender from '../../will-render/WillRender';

interface RoninWalletProps {
  onConnect?: (provider: ethers.providers.Web3Provider) => void;
  onDisconnect?: () => void;
}

const RoninWallet: FC<RoninWalletProps> = ({ onConnect, onDisconnect }) => {
  const { connector, setConnector, isConnected, setIsConnected, setAccount, setChainId, account } = useConnectorStore();
  const [connecting, setConnecting] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const connectWallet = async () => {
    setConnecting(true);
    setError(null);
    
    if (!connector) {
      setError('Wallet connector not initialized');
      setConnecting(false);
      return;
    }
    
    try {
      const result = await connector.connect();
      
      if (!isNil(result.account)) {
        setIsConnected(true);
        
        // Create ethers provider and pass to parent component if provided
        if (onConnect) {
          try {
            const providerInstance = await connector.getProvider();
            const provider = new ethers.providers.Web3Provider(providerInstance as any);
            onConnect(provider);
          } catch (err) {
            console.error('Error creating provider:', err);
          }
        }
      }
    } catch (err) {
      console.error('Error connecting to wallet:', err);
      setError('Failed to connect wallet. Please make sure Ronin wallet is installed.');
    } finally {
      setConnecting(false);
    }
  };
  
  const disconnectWallet = async () => {
    try {
      if (connector) {
        await connector.disconnect();
      }
      setIsConnected(false);
      
      if (onDisconnect) {
        onDisconnect();
      }
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
    }
  };

  const onConnectHandler = (payload: IConnectResult) => {
    setIsConnected(true);
    setAccount(payload.account);
    setChainId(payload.chainId);
    
    // Create ethers provider and pass to parent component if provided
    if (onConnect) {
      try {
        const provider = new ethers.providers.Web3Provider(payload.provider as any);
        onConnect(provider);
      } catch (err) {
        console.error('Error creating provider:', err);
      }
    }
  };

  const onAccountChange = async (accounts: string[]) => {
    console.log('Account changed:', accounts);
    if (accounts.length > 0) {
      setAccount(accounts[0]);
      
      // If already connected, update provider
      if (isConnected && connector && onConnect) {
        try {
          const providerInstance = await connector.getProvider();
          if (providerInstance) {
            const provider = new ethers.providers.Web3Provider(providerInstance as any);
            onConnect(provider);
          }
        } catch (err) {
          console.error('Error updating provider after account change:', err);
        }
      } else {
        setIsConnected(false);
      }
    } else {
      // No accounts, so disconnect
      setIsConnected(false);
      if (onDisconnect) {
        onDisconnect();
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    
    setIsConnected(false);
    
    const setupConnector = async () => {
      try {
        const roninConnector = await requestRoninWalletConnector();
        
        if (!mounted) return;
        
        setConnector(roninConnector);
        
        // Setup event listeners with proper function references that we can later remove
        const connectListener = (payload: IConnectResult) => onConnectHandler(payload);
        const accountsChangedListener = (accounts: string[]) => onAccountChange(accounts);
        const chainChangedListener = async (chainId: number) => {
          setChainId(chainId);
          
          // Update provider if chain changes
          if (isConnected && connector && onConnect) {
            try {
              const providerInstance = await connector.getProvider();
              if (providerInstance) {
                const provider = new ethers.providers.Web3Provider(providerInstance as any);
                onConnect(provider);
              }
            } catch (err) {
              console.error('Error updating provider after chain change:', err);
            }
          }
        };
        const disconnectListener = () => {
          setIsConnected(false);
          if (onDisconnect) {
            onDisconnect();
          }
        };
        
        roninConnector.on(ConnectorEvent.CONNECT, connectListener);
        roninConnector.on(ConnectorEvent.ACCOUNTS_CHANGED, accountsChangedListener);
        roninConnector.on(ConnectorEvent.CHAIN_CHANGED, chainChangedListener);
        roninConnector.on(ConnectorEvent.DISCONNECT, disconnectListener);
        
        // Store the listeners for cleanup
        return {
          connectListener,
          accountsChangedListener,
          chainChangedListener,
          disconnectListener
        };
      } catch (err) {
        console.error('Error setting up Ronin connector:', err);
        if (mounted) {
          setError('Failed to initialize Ronin wallet connector');
        }
        return null;
      }
    };
    
    // Set up the connector and store the listeners
    const listenerPromise = setupConnector();
    
    // Cleanup function
    return () => {
      mounted = false;
      
      // Clean up event listeners
      if (connector) {
        listenerPromise.then(listeners => {
          if (listeners) {
            connector.off(ConnectorEvent.CONNECT, listeners.connectListener);
            connector.off(ConnectorEvent.ACCOUNTS_CHANGED, listeners.accountsChangedListener);
            connector.off(ConnectorEvent.CHAIN_CHANGED, listeners.chainChangedListener);
            connector.off(ConnectorEvent.DISCONNECT, listeners.disconnectListener);
          }
        }).catch(err => console.error('Error cleaning up listeners:', err));
      }
    };
  }, []);

  return (
    <div className={'flex flex-col justify-center'}>
      <WillRender when={!isConnected}>
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
      </WillRender>
      
      <WillRender when={isConnected}>
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="text-sm font-medium px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-600">
            {account ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}` : 'Unknown'}
          </div>
          <button
            onClick={disconnectWallet}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
          >
            Disconnect
          </button>
        </div>
      </WillRender>
    </div>
  );
};

export default RoninWallet;
