# PyTrade
TypeScript investment aggregation app.

## Setup
```powershell
pnpm install
```

Requires PostgreSQL and a root `.env` with `DATABASE_URL`.
Market data sync also uses `EODHD_TOKEN` and `TIINGO_API_TOKEN`.

## Run Apps

```powershell
pnpm dev
pnpm dev:api
pnpm dev:web
```

Web: `http://localhost:3000`
API: `http://localhost:3001`

## Build / Check

```powershell
pnpm build
pnpm build:api
pnpm build:web
pnpm typecheck:api
pnpm market-data:build
```

## Database

```powershell
pnpm db:generate
pnpm db:migrate
```

## SnapTrade Sync

```powershell
pnpm sync
pnpm transaction_tofile
pnpm position_tofile
```

## Market Data Sync

```powershell
pnpm market-data:sync
pnpm market-data:sync:eodhd
pnpm market-data:sync:tiingo
pnpm market-data:test:eodhd
pnpm market-data:test:tiingo
```

`market-data:sync` defaults to EODHD. EODHD sync stores dividends, latest prices, and USD/CAD FX snapshots.

Common options:

```powershell
pnpm market-data:sync:eodhd --force
pnpm market-data:sync:eodhd --fxPairs=USD/CAD,EUR/USD
pnpm market-data:sync:tiingo --force
```

## API Checks

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3001/health
Invoke-WebRequest -UseBasicParsing http://localhost:3001/api/portfolio/dashboard
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/portfolio/dashboard
```
