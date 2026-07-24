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
pnpm sync -- --replace-snaptrade-data
```

The sync is incremental and idempotent: account/transaction/order rows use
their external identifiers, activities resume from the newest stored trade
date with a seven-day correction overlap, and current positions/balances are
reconciled without recreating unchanged rows.

`--replace-snaptrade-data` fetches full activity history before deleting and
replacing transactions owned by SnapTrade. Statement and legacy-imported
transactions are preserved. `--replace` is accepted as a shorter alias.

## Market Data Sync

```powershell
pnpm market-data:sync -- --provider=eodhd
pnpm market-data:sync -- --provider=tiingo
pnpm market-data:test -- --provider=eodhd
pnpm market-data:test -- --provider=tiingo
```

There is one market-data sync entry point. The provider is explicit because
EODHD stores dividends, prices, and FX snapshots while Tiingo currently stores
dividends only. The separate `market-data:test` command checks provider
credentials and responses without running a database sync.

Common options:

```powershell
pnpm market-data:sync -- --provider=eodhd --force
pnpm market-data:sync -- --provider=eodhd --fxPairs=USD/CAD,EUR/USD
pnpm market-data:sync -- --provider=tiingo --force
```

## Data Import and Maintenance

```powershell
pnpm statements:extract
pnpm statements:import -- --dry-run
pnpm statements:import
pnpm sqlite:import
pnpm data:normalize
pnpm data:normalize -- --apply
```

`data:normalize` is the only retained general data-fixing command. It is a
dry run unless `--apply` is supplied and remains useful when canonical
transaction-normalization rules change. Duplicate prevention, security
matching, option normalization, and Wealthsimple cash/card cleanup now happen
inside the SnapTrade and statement import paths, so there are no standalone
dedupe or provider-specific repair commands.

The Questrade PDF and legacy SQLite importers remain because they are
repeatable source-data ingestion workflows, not repairs against already
imported rows.

## API Checks

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3001/health
Invoke-WebRequest -UseBasicParsing http://localhost:3001/api/portfolio/dashboard
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/portfolio/dashboard
```

## Troubleshooting

### Stale dev servers on 3000 / 3001

Symptoms:

- `listen EADDRINUSE: address already in use 0.0.0.0:3001`
- App loads a broken or partial page.
- Next shows `missing required error components, refreshing...`
- API calls hang because another process is already using `3001`.

Check which processes own the ports in Windows `cmd`:

```cmd
netstat -ano | findstr :3000
netstat -ano | findstr :3001
```

The PID is the number at the far right. Kill the stale process:

```cmd
taskkill /PID <PID> /F
```

Example:

```cmd
taskkill /PID 10752 /F
taskkill /PID 14892 /F
```

Clear the Next dev/build cache from the repo root:

```cmd
powershell -NoProfile -Command "Remove-Item -Recurse -Force apps/web/.next -ErrorAction SilentlyContinue"
```

Then restart:

```cmd
pnpm dev
```

Expected ports:

- Web / Next: `3000`
- API / Fastify: `3001`

If `3001` is owned by a Next process, kill it. `3001` should be the API only.

### Build ran while dev was running

Running `pnpm build:web` while `pnpm dev` is still running can leave the dev server reading production `.next` artifacts. Stop dev, clear `.next`, then restart:

```cmd
taskkill /PID <web-dev-pid> /F
powershell -NoProfile -Command "Remove-Item -Recurse -Force apps/web/.next -ErrorAction SilentlyContinue"
pnpm dev
```
