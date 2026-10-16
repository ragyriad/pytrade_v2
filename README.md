# PyTrade

TypeScript investment aggregation app for importing, syncing, and reviewing portfolio data.

## Requirements

- Node.js 22 and pnpm 10.33
- PostgreSQL
- Project environment variables for the database, Clerk, and the providers you use

Keep credentials in the local root `.env` or inject them into the runtime. Do not commit secrets.

## Local development

```powershell
pnpm install
pnpm db:migrate
pnpm dev
```

The development command starts the web app and API. For initial Clerk administrator setup, see [CLERK_SETUP.md](./CLERK_SETUP.md).

## Docker

Build the image from the repository root, providing the public Clerk build arguments required by Next.js:

```powershell
docker build -t pytrade `
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace_me `
  --build-arg NEXT_PUBLIC_APP_URL=https://example.com .

# Run with runtime environment variables configured for the container
docker run --rm -p 3000:3000 -p 3001:3001 --env-file .env pytrade
```

Run database migrations separately with `pnpm db:migrate`.

## Essential commands

```text
pnpm test                    # unit and component tests
pnpm test:integration        # PostgreSQL integration tests (Docker locally)
pnpm build                   # workspace production build
pnpm db:generate             # generate a Drizzle migration
pnpm db:migrate              # apply migrations
pnpm demo:seed               # create/replace the selected demo user data
pnpm demo:reset              # remove the selected demo user generated data
pnpm snaptrade:sync          # sync SnapTrade data
pnpm market-data:sync -- --provider=tiingo  # sync one provider
pnpm market-data:sync:all    # sync configured non-EODHD providers
pnpm statements:extract      # extract statement data for review
pnpm statements:import       # import statement data
pnpm sqlite:import            # import legacy SQLite data
```

Use `pnpm demo:seed -- --dry-run` and `pnpm demo:reset -- --dry-run` to preview demo operations. See [DEMO_DATA.md](./packages/db/src/demo/DEMO_DATA.md) for ownership and reset behavior. Market-data, SnapTrade, and importer packages expose additional focused commands.
