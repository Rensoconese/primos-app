# Development Tools and Test Files

This directory contains test files and development tools that are not required for the main application but are useful during development.

## Structure

- `scripts/`: Development scripts
  - `script-generate-nft-points-map.ts`: Script to generate NFT points mapping
  - `generate-nft-points.js`: JavaScript version of the NFT points generator

- `marketplace-test/`: Test files for the marketplace functionality
  - `page.tsx`: Page component for the marketplace test
  - `schema.json`: GraphQL schema for the marketplace test

- `components/`: Test components
  - `MarketplaceTest/`: Components for testing marketplace functionality
    - `MarketplaceTest.tsx`: Main component for the marketplace test

- `api/`: Test API endpoints
  - `test-marketplace/`: Endpoint for testing marketplace functionality
  - `test-redis/`: Endpoint for testing Redis functionality
  - `test-redis-only/`: Endpoint for testing Redis-only functionality
  - `test-date-service/`: Endpoint for testing date service
  - `redis-stats/`: Endpoint for viewing Redis statistics
  - `redis-clear/`: Endpoint for clearing Redis cache

- `fix-leaderboard.js`: Script to verify and correct discrepancies between the `rewards` table and the `leaderboard` table
- `fix-user-leaderboard.sh`: Shell script to run the leaderboard fix for a specific wallet address

## Usage

These files are excluded from Git by default (via .gitignore) and are intended for local development only.

### Test Endpoints

1. Start the development server:
   ```
   npm run dev
   ```

2. Access the test pages:
   - Marketplace test: http://localhost:3000/marketplace-test
   - Redis test: http://localhost:3000/api/test-redis
   - Redis stats: http://localhost:3000/api/redis-stats
   - etc.

### Leaderboard Fix Scripts

If you encounter issues with the leaderboard not showing the correct number of claimed tokens:

1. Fix a specific wallet's leaderboard entry:
   ```
   ./dev-tools/fix-user-leaderboard.sh <wallet_address>
   ```

2. Fix all leaderboard entries:
   ```
   node dev-tools/fix-leaderboard.js
   ```

These scripts will:
- Calculate the total tokens claimed from the `rewards` table
- Compare with the current value in the `leaderboard` table
- Update the leaderboard if there's a discrepancy

Requirements:
- Node.js
- Supabase environment variables in `.env` or `.env.local`
- `@supabase/supabase-js` and `dotenv` packages (will be installed automatically if needed)

## Important Note

Do not rely on these files for production functionality. They are meant for testing and development purposes only.
