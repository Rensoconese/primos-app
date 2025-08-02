# Primos CheckIn - Project Documentation

## 🎮 Project Overview

Primos CheckIn is a Web3 gamification application built on the Ronin blockchain that incentivizes daily user engagement through check-ins, NFT ownership, and reward distribution. Users connect their Ronin wallets, perform daily check-ins using their Primos NFTs, accumulate points based on NFT rarity and streak multipliers, and can claim Fire Dust tokens as rewards.

### Key Features

- **Daily Check-in System**: Users can check in once per UTC day
- **NFT-Based Rewards**: Points are calculated based on owned Primos NFTs
- **Streak Multipliers**: Consecutive check-ins increase reward multipliers
- **Token Rewards**: Points can be exchanged for Fire Dust tokens (ERC1155)
- **Leaderboard**: Global rankings for competition

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Blockchain**: Ronin Network, viem library for Web3 interactions
- **Database**: Supabase (PostgreSQL)
- **Caching**: Redis (via Vercel KV)
- **Styling**: TailwindCSS, Framer Motion
- **Analytics**: Sentry for error monitoring

### Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── check-in/      # Check-in endpoint
│   │   ├── claim-rewards/ # Token claiming
│   │   ├── leaderboard/   # Leaderboard data
│   │   ├── sync-nfts/     # NFT synchronization
│   │   └── user-data/     # User statistics
│   ├── components/        # React components
│   ├── fonts/            # Custom fonts
│   └── page.tsx          # Main application page
├── data/                  # Static data files
│   └── nftPoints.ts      # NFT point mappings
├── lib/                   # Utility libraries
│   ├── contract.ts       # Smart contract interactions
│   ├── db.ts            # Database connection
│   ├── redis.ts         # Redis configuration
│   └── utils.ts         # Helper functions
└── types/                # TypeScript definitions
```

## 🔄 User Flow

### 1. Initial Connection
- User arrives at the landing page
- Clicks "Connect Wallet" to connect Ronin Wallet
- Wallet connection persists across sessions

### 2. Main Dashboard (Connected State)
Three main panels are displayed:

#### A. Check-In Panel
- Shows current streak and last check-in time
- "Check In Now" button (disabled if already checked in today)
- Check-in triggers blockchain transaction

#### B. NFT Collection Panel
- Displays owned Primos NFTs
- Shows bonus points per NFT
- Indicates which NFTs are used today
- Excludes NFTs listed on marketplace

#### C. Rewards Panel
- Shows total accumulated points
- Fire Dust token balance
- "Claim Rewards" button to exchange points for tokens

### 3. Check-In Process
1. Verify 24 hours have passed since last check-in (UTC)
2. Calculate points: Base NFT points × Streak multiplier
3. Execute blockchain transaction
4. Update database with new check-in
5. Lock used NFTs for 24 hours (Redis)
6. Update UI with success message

### 4. Rewards Claiming
1. User clicks "Claim Rewards" with available points
2. Backend transfers Fire Dust tokens from pool wallet
3. Points are deducted from user account
4. Transaction logged in database

## 💎 NFT & Points System

### NFT Contract
- **Address**: `0x23924869ff64ab205b3e3be388a373d75de74ebd` (Ronin)
- **Total Supply**: 2,378 unique NFTs

### Point Values
- **Original**: +1 punto
- **Original Z**: +4 puntos
- **Shiny**: +7 puntos
- **Shiny Z**: +13 puntos
- **Unique**: +30 puntos
- **Full Set** (adicional): +2 puntos

### Streak Multipliers
```
Days 1-7:   1.0x multiplier
Days 8-14:  1.5x multiplier
Days 15-21: 2.0x multiplier
Days 22-28: 2.5x multiplier
Days 29+:   3.0x multiplier
```

### Fire Dust Token
- **Contract**: `0xE3a334D6b7681D0151b81964CAf6353905e24B1b`
- **Token ID**: 4 (ERC1155)
- **Pool Wallet**: `0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF`
- **Exchange Rate**: 1 point = 1 Fire Dust token

## 📊 Database Schema

### Main Tables

#### users
- Primary user information
- Tracks streaks, points, check-in history
- Unique by wallet_address

#### check_ins
- Historical record of all check-ins
- Includes points earned, multipliers, transaction hashes

#### nfts
- NFT ownership records
- Metadata, rarity, bonus points
- Synced from blockchain

#### rewards
- Token claim history
- Points spent, tokens received

#### leaderboard
- Aggregated user statistics
- Used for global rankings

#### nft_usage_tracking
- Tracks which NFTs were used in check-ins
- Prevents reuse within 24 hours

#### nft_summary_history  
- Historical NFT ownership snapshots
- Daily summaries of user NFT holdings

#### health_check
- System health monitoring
- Database connectivity verification

## 🔧 Configuration & Environment

### Required Environment Variables
```env
# Database
DATABASE_URL=

# Redis
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# Blockchain RPC
MORALIS_API_KEY=
NEXT_PUBLIC_RPC_URL=

# Pool Wallet
POOL_WALLET_PRIVATE_KEY=

# Sentry
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

### Key Configuration Files
- `next.config.js` - Next.js configuration
- `tsconfig.json` - TypeScript settings
- `tailwind.config.ts` - Styling configuration

## 🚀 Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

## 🔐 Security Considerations

1. **Private Keys**: Pool wallet private key must be secured
2. **RLS (Row Level Security)**: Enabled on all Supabase tables
3. **Input Validation**: All user inputs validated
4. **Transaction Verification**: All blockchain transactions verified
5. **Rate Limiting**: Check-ins limited to once per day

## 📈 Monitoring & Analytics

- **Sentry**: Error tracking and performance monitoring
- **Database Logs**: Available via Supabase dashboard
- **Blockchain Events**: Transaction monitoring on Ronin

## 🔄 Maintenance Tasks

### Daily
- Monitor pool wallet balance
- Check for failed transactions
- Review error logs

### Weekly
- Analyze user engagement metrics
- Review leaderboard for anomalies
- Check NFT sync accuracy

### Monthly
- Database optimization
- Clear old Redis entries
- Review and update NFT point mappings

## 🐛 Common Issues & Solutions

### NFT Points System Architecture (Updated 2025-08-02)

**Sistema de dos pasos para generar puntos NFT:**

#### Paso 1: Mapeo de NFTs (`sync-full-collection`)
- **Función**: Lee el contrato NFT directamente y extrae metadatos
- **Genera**: `src/data/nftMappings.ts` con estructura:
  ```typescript
  {
    token_id: number,
    rarity: string,      // "original", "original Z", "shiny Z summer", etc.
    is_full_set: boolean,
    metadata?: any
  }
  ```
- **NO asigna puntos**, solo mapea la información de cada NFT
- **Se ejecuta cuando**: Las rarezas cambian en el contrato (evoluciones)

#### Paso 2: Asignación de Puntos (`generate-points-map`)
- **Función**: Lee el archivo de mapeo y aplica configuración de puntos
- **Lee**: `src/data/nftMappings.ts` (generado en paso 1)
- **Aplica**: Configuración de puntos desde tabla `nft_points_mapping`:
  ```
  | Rareza            | Puntos Base | Full Set Bonus |
  |-------------------|-------------|----------------|
  | original          | 1           | +2             |
  | original Z        | 4           | +2             |
  | original Z summer | 10          | +2             |
  | shiny             | 7           | +2             |
  | shiny Z           | 13          | +2             |
  | shiny Z summer    | 22          | +2             |
  | unique            | 30          | +2             |
  ```
- **Genera**: `src/data/nftPoints.ts` con puntos finales
- **Se ejecuta cuando**: Cambia la configuración de puntos en el admin

**IMPORTANTE**: 
- NO hay base de datos involucrada en el mapeo
- Los archivos se guardan en GitHub, no en Supabase
- El flujo es: Contrato → Mapeo → Puntos → Archivo final

### NFT Points System Issues (Fixed 2025-07-25)
**Problem**: All NFTs showing 1 point instead of correct rarity-based values
**Root Cause**: Corrupted `bonus_points` column in database conflicting with generated points map
**Solution Applied**:
1. Removed `bonus_points` column from database entirely
2. Updated points calculation to use only generated `nftPoints.ts` file as single source of truth
3. Fixed generation script to calculate points correctly from `rarity` + `is_full_set` fields
4. Regenerated points map with correct values (2,382 NFTs)
5. Updated all code references to use `getNFTPointsSafe()` function

**Prevention**: Always use the generated points file; never rely on database columns for point calculation

### Admin Access Issues (Fixed 2025-07-26)
**Problem**: Wallet autorizada no puede acceder al panel admin en producción
**Root Cause**: Lista de wallets desincronizada entre frontend y backend
**Solution Applied**:
1. Actualizar lista en todos los endpoints backend admin (5 archivos)
2. Sincronizar frontend `src/config/admin.ts` con misma lista
3. Deploy de ambos cambios a producción

**Lista oficial de wallets admin**:
- `0xce6818326aa1db5641528d11f3121a7f84b53eff` // PRIMOS_WALLET
- `0xc1b977a826b75a87b5423bbe952104bcee885315` // MONSAI_WALLET  
- `0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF` // POOL_WALLET
- `0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6` // RENSO_WALLET
- `0x66BE3123Fdf641070f8834Fbe66803C8559255f6` // ADMIN_WALLET

**Prevention**: Mantener sincronizadas las listas en:
- Backend endpoints: `src/app/api/admin/*/route.ts`
- Frontend config: `src/config/admin.ts`

### NFTs Not Showing
1. Check if sync-nfts API is working
2. Verify RPC endpoint is responsive
3. Check if NFTs are listed on marketplace

### Check-in Failures
1. Verify user hasn't already checked in today
2. Check blockchain RPC availability
3. Ensure pool wallet has gas

### Reward Claim Issues
1. Verify pool wallet has sufficient Fire Dust
2. Check transaction gas settings
3. Review failed transactions in database

### Dynamic Import Errors
**Problem**: "Cannot access 'S' before initialization" in React components
**Solution**: Use static imports at component top instead of dynamic `await import()` inside functions

## 📝 Possible Future Enhancements

- Multi-token reward support
- Social features (teams, referrals)  
- Mobile app development
- Cross-chain expansion

## 🤝 Support & Resources

- **GitHub Issues**: Report bugs and request features
- **Supabase Dashboard**: Database management
- **Ronin Explorer**: Transaction verification
- **Team Contacts**: Listed in internal documentation
