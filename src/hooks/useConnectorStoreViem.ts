import { create } from 'zustand';
import { WalletClient } from 'viem';

interface IConnectorStoreViemState {
  isConnected: boolean;
  account: string | null;
  chainId: number | null;
  client: WalletClient | null;
}

interface IConnectorStoreViemAction {
  setIsConnected: (connected: boolean) => void;
  setAccount: (account: string | null) => void;
  setChainId: (chainId: number | null) => void;
  setClient: (client: WalletClient | null) => void;
}

export const useConnectorStoreViem = create<IConnectorStoreViemState & IConnectorStoreViemAction>(set => ({
  isConnected: false,
  account: null,
  chainId: null,
  client: null,

  setIsConnected: (connected: boolean) => set({ isConnected: connected }),
  setAccount: (account: string | null) => set({ account }),
  setChainId: (chainId: number | null) => set({ chainId }),
  setClient: (client: WalletClient | null) => set({ client }),
}));
