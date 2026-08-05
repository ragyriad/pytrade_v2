FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.root.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Next.js inlines NEXT_PUBLIC_* values during its build. Only public values
# belong here; all secrets are supplied to the running containers from .env.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL

RUN printf "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=%s\nNEXT_PUBLIC_APP_URL=%s\n" \
    "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "$NEXT_PUBLIC_APP_URL" > .env \
    && pnpm turbo run build --filter=@repo/api --filter=web

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY --from=build /app /app

ENV NODE_ENV=production
