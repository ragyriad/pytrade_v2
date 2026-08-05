# PyTrade

TypeScript investment aggregation app.

## Setup

Requires Node.js, pnpm, PostgreSQL, and a root `.env` based on `.env.example`.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:migrate
```

For Clerk authentication and the first administrator, see
[CLERK_SETUP.md](./CLERK_SETUP.md).

## Run

```powershell
pnpm dev       # web and API
pnpm dev:web   # http://localhost:3000
pnpm dev:api   # http://localhost:3001
```

## Checks and tests

```powershell
pnpm lint
pnpm build
pnpm typecheck:api
pnpm test
pnpm test:e2e
pnpm test:integration
```

Locally, the integration command starts and removes a disposable Docker
PostgreSQL database. CI supplies its own test database. Never point
`TEST_DATABASE_URL` at production data. See [TEST_CATALOG.txt](./TEST_CATALOG.txt)
for coverage details.

## CI

GitHub Actions runs on every push and pull request, with separate jobs for
linting, build/type-check, unit/browser tests, and PostgreSQL integration
tests.

With Docker Desktop running, use `act` to run the complete GitHub Actions
workflow locally and save its output:

```powershell
act push `
  -W .github/workflows/ci.yml `
  --artifact-server-path .tmp/act-artifacts `
  --action-offline-mode `
  2>&1 | Tee-Object act-ci.log
```

If an action or image has not been downloaded yet, run once without
`--action-offline-mode`. To extract failures from the saved log:

```powershell
Select-String .\act-ci.log `
  -Pattern 'Failure|Error:|ELIFECYCLE|exit code|failed' `
  -Context 3,10
```

Avoid `act -v`: it logs environment variables. Rotate any credentials exposed
by a previous verbose run.

## Common operations

```powershell
pnpm market-data:sync -- --provider=eodhd
pnpm market-data:sync:all
pnpm statements:extract
pnpm statements:import -- --dry-run
pnpm sqlite:import
pnpm demo:seed
```

See [DEMO_DATA.md](./DEMO_DATA.md) for demo data and package scripts for the
full set of import, sync, and maintenance commands.
