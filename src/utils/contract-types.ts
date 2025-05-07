import { 
  Address, 
  Abi, 
  PublicClient, 
  WalletClient, 
  Transport, 
  Account, 
  Chain, 
  GetContractReturnType,
  ContractFunctionArgs,
  ContractFunctionName,
  ReadContractParameters,
  WriteContractParameters
} from 'viem';

// Define the contract function types
export type CheckInContractFunctions = {
  // View functions
  owner: () => Promise<Address>;
  MAX_QUERY_LIMIT: () => Promise<bigint>;
  PERIOD_DURATION: () => Promise<bigint>;
  limitDailyCheckIn: () => Promise<bigint>;
  periodEndAt: () => Promise<bigint>;
  
  // User-related view functions
  isCheckedInToday: (user: Address) => Promise<boolean>;
  isMissedCheckIn: (user: Address) => Promise<boolean>;
  getCurrentStreak: (user: Address) => Promise<bigint>;
  getLastUpdatedPeriod: (user: Address) => Promise<bigint>;
  getStreakAtPeriod: (user: Address, period: bigint | number) => Promise<bigint>;
  computePeriod: (timestamp: bigint | number) => Promise<bigint>;
  
  // Transaction functions
  checkIn: (to: Address) => Promise<`0x${string}`>;
  initialize: (owner: Address, _limitDailyCheckIn: bigint | number, _periodEndAt: bigint | number) => Promise<`0x${string}`>;
  renounceOwnership: () => Promise<`0x${string}`>;
  setLimitDailyCheckIn: (_limitDailyCheckIn: bigint | number) => Promise<`0x${string}`>;
  transferOwnership: (newOwner: Address) => Promise<`0x${string}`>;
  
  // Complex functions with multiple return values
  getHistory: (
    user: Address,
    from: bigint | number,
    to: bigint | number,
    limit: bigint | number,
    offset: bigint | number
  ) => Promise<{
    numPeriod: bigint;
    periods: bigint[];
    streakCounts: bigint[];
  }>;
};

// Define the contract type
export type CheckInContract = GetContractReturnType<typeof CHECK_IN_ABI, PublicClient | WalletClient, Address>;

// Complete ABI from check-in.json
export const CHECK_IN_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyCheckedIn",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DailyLimitExceeded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidInitialization",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotInitializing",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyCalledOnce",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PeriodEndAtInvalid",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "period",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      }
    ],
    "name": "CheckedIn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "endOfPeriod",
        "type": "uint256"
      }
    ],
    "name": "EndOfPeriodTsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "version",
        "type": "uint64"
      }
    ],
    "name": "Initialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "limitDailyCheckIn",
        "type": "uint256"
      }
    ],
    "name": "LimitDailyCheckInUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_QUERY_LIMIT",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PERIOD_DURATION",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "checkIn",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "computePeriod",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getCurrentStreak",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "from",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "to",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "limit",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "offset",
        "type": "uint256"
      }
    ],
    "name": "getHistory",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "numPeriod",
        "type": "uint256"
      },
      {
        "internalType": "uint256[]",
        "name": "periods",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256[]",
        "name": "streakCounts",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getLastUpdatedPeriod",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "period",
        "type": "uint256"
      }
    ],
    "name": "getStreakAtPeriod",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_limitDailyCheckIn",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_periodEndAt",
        "type": "uint256"
      }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "isCheckedInToday",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "isMissedCheckIn",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "limitDailyCheckIn",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "periodEndAt",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_limitDailyCheckIn",
        "type": "uint256"
      }
    ],
    "name": "setLimitDailyCheckIn",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Factory function for creating contract instances using viem
export const getCheckInContract = (
  client: PublicClient | WalletClient,
  address: Address
) => {
  return {
    address,
    abi: CHECK_IN_ABI,
    client,
  } as unknown as CheckInContract;
};

// Helper function to read from the contract
export const readCheckInContract = async <
  TFunctionName extends ContractFunctionName<typeof CHECK_IN_ABI, 'view' | 'pure'>,
>(
  client: PublicClient,
  args: Omit<ReadContractParameters<typeof CHECK_IN_ABI, TFunctionName>, 'abi'> & {
    address: Address
  }
) => {
  return client.readContract({
    abi: CHECK_IN_ABI,
    ...args,
  });
};

// Helper function to write to the contract
export const writeCheckInContract = async <
  TFunctionName extends ContractFunctionName<typeof CHECK_IN_ABI, 'nonpayable' | 'payable'>,
>(
  client: WalletClient,
  args: {
    address: Address,
    functionName: TFunctionName,
    args?: any[],
    account: Address,
    chain: Chain
  }
) => {
  return client.writeContract({
    abi: CHECK_IN_ABI,
    address: args.address,
    functionName: args.functionName,
    args: args.args,
    account: args.account,
    chain: args.chain
  });
};
