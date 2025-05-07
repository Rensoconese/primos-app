import { create } from 'zustand';
import { WalletClient } from 'viem';

// Definición de tipo para compatibilidad con código antiguo
type IBaseConnector = any;

interface IConnectorStoreState {
  isConnected: boolean;
  account: string | null;
  chainId: number | null;
  connector: IBaseConnector | null;
  client: WalletClient | null;
}

interface IConnectorStoreAction {
  setIsConnected: (connected: boolean) => void;
  setAccount: (account: string | null) => void;
  setChainId: (chainId: number | null) => void;
  setConnector: (connector: IBaseConnector | null) => void;
  setClient: (client: WalletClient | null) => void;
}

export const useConnectorStore = create<IConnectorStoreState & IConnectorStoreAction>(set => ({
  isConnected: false,
  account: null,
  chainId: null,
  connector: null,
  client: null,

  setIsConnected: (connected: boolean) => set({ isConnected: connected }),
  setConnector: (connector: IBaseConnector | null) => set({ connector }),
  setAccount: (account: string | null) => set({ account }),
  setChainId: (chainId: number | null) => set({ chainId }),
  setClient: (client: WalletClient | null) => set({ client }),
}));

// Alias para compatibilidad con código migrado
export const useConnectorStoreViem = useConnectorStore;
