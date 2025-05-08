# Primos Daily Check-in App

A Next.js application that interacts with a daily check-in contract deployed on the Ronin Saigon testnet.

## Features

- Connect to Ronin wallet
- View last check-in time
- Perform daily check-ins
- Track check-in count
- Check contract owner and user status

## Prerequisites

- Node.js and npm installed
- Ronin wallet browser extension installed
- Access to Ronin Saigon testnet

## Getting Started

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Deploy the contract to Ronin Saigon testnet (see below)
4. Update the contract address in `src/utils/contract.ts`
5. Start the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deploying the Contract

The contract bytecode is provided in `src/utils/contract.ts`. You can deploy it to the Ronin Saigon testnet using:

1. Ronin wallet browser extension
2. Remix IDE connected to Ronin network
3. Hardhat or Truffle with Ronin network configuration

After deploying the contract, update the `CONTRACT_ADDRESS` in `src/utils/contract.ts` with your deployed contract address.

## Contract Functions

The contract provides the following functions:

- `owner()`: Returns the contract owner address
- `transferOwnership(address newOwner)`: Transfers ownership to a new address
- `renounceOwnership()`: Renounces ownership
- `checkIn(address account)`: Records a daily check-in for an account
- `getLastCheckIn(address account)`: Returns the timestamp of the last check-in
- `hasCheckedIn(address account)`: Checks if an account has already checked in today
- `getCheckInCount(address account)`: Returns the total number of check-ins for an account

## Ronin Saigon Testnet

Ronin Saigon is the testnet for the Ronin blockchain. To use it:

1. Add Saigon testnet to your Ronin wallet:
   - Network Name: Ronin Saigon Testnet
   - RPC URL: https://saigon-testnet.roninchain.com/rpc
   - Chain ID: 2021
   - Symbol: RON
   - Block Explorer URL: https://saigon-explorer.roninchain.com

2. Get testnet RON from the faucet (if available)

## Technologies Used

- Next.js
- TypeScript
- Tailwind CSS
- ethers.js
- Ronin wallet integration

## Troubleshooting

- Make sure your Ronin wallet is connected to the Saigon testnet
- Ensure you have sufficient testnet RON for gas fees
- Check the console for any errors during contract interactions

## Documentation and Development Files

### Documentation

All project documentation is stored in the `memory-bank/` directory:

- `projectbrief.md`: Core project requirements and goals
- `productContext.md`: Why this project exists and how it should work
- `systemPatterns.md`: System architecture and design patterns
- `techContext.md`: Technologies used and technical constraints
- `activeContext.md`: Current work focus and recent changes
- `progress.md`: What works and what's left to build
- Additional documentation files for specific features

### Development Tools and Test Files

This project includes development tools and test files that are not required for the main application but are useful during development. These files are excluded from Git by default (via .gitignore).

### Test Files Structure

- `dev-tools/`: Directory containing all test files and utilities
  - `marketplace-test/`: Test files for the marketplace functionality
  - `components/MarketplaceTest/`: Components for testing marketplace functionality
  - `api/`: Test API endpoints (test-marketplace, test-redis, etc.)

### Managing Test Files

A script is provided to help manage test files between the main structure and the dev-tools directory:

```bash
# Make the script executable (if needed)
chmod +x dev-tools/manage-test-files.sh

# To restore test files to the main structure (for development)
./dev-tools/manage-test-files.sh restore

# To backup test files to dev-tools (before committing)
./dev-tools/manage-test-files.sh backup
```

### Excluded Files

The following files and directories are excluded from Git:

- `/dev-tools/`
- `src/app/marketplace-test/`
- `src/components/MarketplaceTest/`
- `src/app/api/test-*/`
- `src/app/api/redis-stats/`
- `src/app/api/redis-clear/`

See `.gitignore` for the complete list of excluded files.
