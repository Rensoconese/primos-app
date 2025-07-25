# Development Tools and Test Files

This directory contains test files and development tools that are not required for the main application but are useful during development.

## Structure

```
dev-tools/
├── api/                              # Test API endpoints
│   └── test-redis-simple/           # Simplified Redis test (uses standard env vars only)
├── scripts/                         # Development and maintenance scripts
│   ├── database/                    # Database-related scripts
│   │   └── reset_tables.sql        # Reset all tables to initial state
│   ├── check_project_structure.sh   # Verify project structure
│   ├── fix-leaderboard.js          # Fix leaderboard discrepancies
│   ├── fix-user-leaderboard.sh     # Fix specific user's leaderboard entry
│   ├── generate-nft-points.js      # Generate NFT points with DB integration
│   ├── generateNFTPoints.ts        # TypeScript NFT points generator
│   ├── manage-test-files.sh        # Manage test files
│   ├── script-generate-nft-points-map.ts  # Generate NFT points mapping
│   └── update-nft-bonus-points.ts  # Update NFT bonus points in database
└── README.md                        # This file
```

**Note**: The following endpoints are available in the main application at `src/app/api/`:
- `test-marketplace/`, `test-redis/`, `test-date-service/`, `redis-stats/`, `redis-clear/`

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
