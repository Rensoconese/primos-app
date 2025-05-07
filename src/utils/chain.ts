import { defineChain } from 'viem'

/**
 * Definición de la cadena Ronin Mainnet para viem
 */
export const ronin = defineChain({
  id: 2020,
  name: 'Ronin',
  network: 'ronin',
  nativeCurrency: {
    decimals: 18,
    name: 'RON',
    symbol: 'RON',
  },
  rpcUrls: {
    default: {
      http: ['https://api.roninchain.com/rpc'],
    },
    public: {
      http: ['https://api.roninchain.com/rpc'],
    },
  },
})

/**
 * Definición de la cadena Ronin Saigon Testnet para viem
 */
export const roninSaigon = defineChain({
  id: 2021,
  name: 'Ronin Saigon',
  network: 'ronin-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'RON',
    symbol: 'RON',
  },
  rpcUrls: {
    default: {
      http: ['https://saigon-api.roninchain.com/rpc'],
    },
    public: {
      http: ['https://saigon-api.roninchain.com/rpc'],
    },
  },
})
