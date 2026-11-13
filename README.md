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

VS Code continues to use the root `.env`. Docker loads that file and then applies `.env.docker`, which overrides only values that differ inside the container. Neither file is committed to Git.

```powershell
Copy-Item .env.docker.example .env.docker
```

Edit `.env.docker` and set `DATABASE_URL`. For PostgreSQL running directly on this computer, use `host.docker.internal` as its hostname instead of `localhost`. Keep the same database username, password, port, and name. Put the Clerk **publishable** key (`pk_...`) in root `.env` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; do not use `CLERK_SECRET_KEY` for this value.

From the repository root, build and start the app with Docker Compose:

```powershell
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) to check the app. Stop it with **Ctrl+C**. Docker checks the web `/api/health` endpoint, which also verifies that the API is responding. To see the health status in another PowerShell window:

```powershell
docker compose ps
```

The `STATUS` column reports whether the container is healthy. Use `docker compose down` to stop and remove the container after it has stopped.

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
