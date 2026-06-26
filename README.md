# PyTrade
TypeScript investment aggregation app.

## Setup
```powershell
pnpm install
```
Requires PostgreSQL and a root `.env` with `DATABASE_URL`.
## Run

```powershell
pnpm dev
```

`pnpm dev` starts both apps through Turbo:

```txt
Web / browser: http://localhost:3000
Backend API:   http://localhost:3001
```

Use `3000` in the browser. The web app proxies API data through Next routes.

Run separately:

```powershell
pnpm dev:api
pnpm dev:web
```

## Build / Check

```powershell
pnpm build
pnpm typecheck:api
pnpm build:web
```

No dedicated `test` scripts are configured yet.

## Database

```powershell
pnpm db:generate
pnpm db:migrate
pnpm --filter @repo/db build
```

## Sync

```powershell
pnpm sync
pnpm transaction_tofile
pnpm position_tofile
```

## API Checks

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3001/health
Invoke-WebRequest -UseBasicParsing http://localhost:3001/api/portfolio/dashboard
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/portfolio/dashboard
```

If `3001` is already in use, stop the old API process or run:

```powershell
$env:API_PORT=3002
pnpm --filter @repo/api dev
```
