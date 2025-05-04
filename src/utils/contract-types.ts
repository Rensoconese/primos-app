import { BigNumber, BigNumberish, BytesLike, Contract, ContractInterface, Overrides, Signer, CallOverrides, ContractTransaction } from 'ethers';
import { Provider } from '@ethersproject/providers';

// Extending the Contract with the exact functions we need for our implementation
export interface CheckInContract extends Contract {
  // View functions
  owner(overrides?: CallOverrides): Promise<string>;
  MAX_QUERY_LIMIT(overrides?: CallOverrides): Promise<BigNumber>;
  PERIOD_DURATION(overrides?: CallOverrides): Promise<BigNumber>;
  limitDailyCheckIn(overrides?: CallOverrides): Promise<BigNumber>;
  periodEndAt(overrides?: CallOverrides): Promise<BigNumber>;
  
  // User-related view functions
  isCheckedInToday(user: string, overrides?: CallOverrides): Promise<boolean>;
  isMissedCheckIn(user: string, overrides?: CallOverrides): Promise<boolean>;
  getCurrentStreak(user: string, overrides?: CallOverrides): Promise<BigNumber>;
  getLastUpdatedPeriod(user: string, overrides?: CallOverrides): Promise<BigNumber>;
  getStreakAtPeriod(user: string, period: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
  computePeriod(timestamp: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
  
  // Transaction functions
  checkIn(to: string, overrides?: Overrides & { from?: string }): Promise<ContractTransaction>;
  initialize(owner: string, _limitDailyCheckIn: BigNumberish, _periodEndAt: BigNumberish, overrides?: Overrides & { from?: string }): Promise<ContractTransaction>;
  renounceOwnership(overrides?: Overrides & { from?: string }): Promise<ContractTransaction>;
  setLimitDailyCheckIn(_limitDailyCheckIn: BigNumberish, overrides?: Overrides & { from?: string }): Promise<ContractTransaction>;
  transferOwnership(newOwner: string, overrides?: Overrides & { from?: string }): Promise<ContractTransaction>;
  
  // Complex functions with multiple return values
  getHistory(
    user: string,
    from: BigNumberish,
    to: BigNumberish,
    limit: BigNumberish,
    offset: BigNumberish,
    overrides?: CallOverrides
  ): Promise<{
    numPeriod: BigNumber;
    periods: BigNumber[];
    streakCounts: BigNumber[];
  }>;
}

// Complete ABI from check-in.json
export const CHECK_IN_ABI: ContractInterface = [
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

// Factory class for creating contract instances using the more common pattern
export class CheckIn__factory {
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): CheckInContract {
    return new Contract(address, CHECK_IN_ABI, signerOrProvider) as CheckInContract;
  }
}
