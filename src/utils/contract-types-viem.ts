/**
 * Direcciones de contrato para diferentes redes
 */
export const CONTRACT_ADDRESSES = {
  // Original Saigon testnet contract
  TESTNET: '0x12ad694088243628f4038c1fab32ff89c2f986f2',
  // New mainnet contract
  MAINNET: '0x215d0d82dbd0ca2bb0b6c4e68a5166ddddd5560b'
};

/**
 * Network IDs para Ronin
 */
export const RONIN_CHAIN_IDS = {
  MAINNET: 2020,
  TESTNET: 2021 // Saigon testnet
};

/**
 * Función para obtener la dirección de contrato adecuada según el ID de cadena
 * @param chainId ID de la cadena (opcional)
 * @returns Dirección del contrato
 */
export const getContractAddress = (chainId?: number): string => {
  // Default to testnet if no chainId is provided
  if (!chainId) {
    console.log('No chainId provided, defaulting to testnet contract');
    return CONTRACT_ADDRESSES.TESTNET;
  }

  switch (chainId) {
    case RONIN_CHAIN_IDS.MAINNET:
      console.log('Using mainnet contract address');
      return CONTRACT_ADDRESSES.MAINNET;
    case RONIN_CHAIN_IDS.TESTNET:
      console.log('Using testnet contract address');
      return CONTRACT_ADDRESSES.TESTNET;
    default:
      console.log(`Unknown chainId ${chainId}, defaulting to testnet contract`);
      return CONTRACT_ADDRESSES.TESTNET;
  }
};

/**
 * ABI completo del contrato CheckIn en formato viem
 */
export const CHECK_IN_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [],
    name: "AlreadyCheckedIn",
    type: "error"
  },
  {
    inputs: [],
    name: "DailyLimitExceeded",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "OnlyCalledOnce",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      }
    ],
    name: "OwnableInvalidOwner",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "OwnableUnauthorizedAccount",
    type: "error"
  },
  {
    inputs: [],
    name: "PeriodEndAtInvalid",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "period",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "count",
        type: "uint256"
      }
    ],
    name: "CheckedIn",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "endOfPeriod",
        type: "uint256"
      }
    ],
    name: "EndOfPeriodTsUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "limitDailyCheckIn",
        type: "uint256"
      }
    ],
    name: "LimitDailyCheckInUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address"
      }
    ],
    name: "OwnershipTransferred",
    type: "event"
  },
  {
    inputs: [],
    name: "MAX_QUERY_LIMIT",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "PERIOD_DURATION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address"
      }
    ],
    name: "checkIn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    name: "computePeriod",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "getCurrentStreak",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "from",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "to",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "limit",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "offset",
        type: "uint256"
      }
    ],
    name: "getHistory",
    outputs: [
      {
        internalType: "uint256",
        name: "numPeriod",
        type: "uint256"
      },
      {
        internalType: "uint256[]",
        name: "periods",
        type: "uint256[]"
      },
      {
        internalType: "uint256[]",
        name: "streakCounts",
        type: "uint256[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "getLastUpdatedPeriod",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "period",
        type: "uint256"
      }
    ],
    name: "getStreakAtPeriod",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_limitDailyCheckIn",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "_periodEndAt",
        type: "uint256"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "isCheckedInToday",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "isMissedCheckIn",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "limitDailyCheckIn",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "periodEndAt",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_limitDailyCheckIn",
        type: "uint256"
      }
    ],
    name: "setLimitDailyCheckIn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address"
      }
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

/**
 * Tipo para el ABI del contrato CheckIn
 */
export type CheckInAbi = typeof CHECK_IN_ABI;

/**
 * Tipo para el contrato CheckIn
 */
export type CheckInContract = {
  abi: CheckInAbi;
  address: `0x${string}`;
};

/**
 * Obtiene la configuración del contrato CheckIn según el chainId
 */
export const getCheckInContract = (chainId?: number): CheckInContract => {
  // Determinar la dirección del contrato según el chainId
  const addressStr = getContractAddress(chainId);
  
  // Asegurarse de que la dirección tenga el formato 0x
  const address = addressStr.startsWith('0x') 
    ? addressStr as `0x${string}` 
    : `0x${addressStr}` as `0x${string}`;
  
  return {
    abi: CHECK_IN_ABI,
    address
  };
};
