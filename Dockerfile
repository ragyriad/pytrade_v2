# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.root.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/data_deduplicator/package.json ./packages/data_deduplicator/package.json
COPY packages/data_normalizer/package.json ./packages/data_normalizer/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/market_data_sync/package.json ./packages/market_data_sync/package.json
COPY packages/questrade_legacy_import/package.json ./packages/questrade_legacy_import/package.json
COPY packages/questrade_statement_import/package.json ./packages/questrade_statement_import/package.json
COPY packages/snaptrade_sync/package.json ./packages/snaptrade_sync/package.json

RUN --mount=type=cache,id=pytrade-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

# Next.js inlines NEXT_PUBLIC_* values during its build. Only public values
# belong here; all secrets are supplied to the running containers from .env.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL

RUN printf "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=%s\nNEXT_PUBLIC_APP_URL=%s\n" \
    "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "$NEXT_PUBLIC_APP_URL" > .env \
    && pnpm turbo run build --filter=@repo/api --filter=web \
    && rm -f .env

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY --from=build --chown=node:node /app /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

USER node

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "scripts/start-app.mjs"]
