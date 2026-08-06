# Railway MVP demo deployment

This repository deploys as **one application service** plus Railway Postgres.
The application service starts Next.js on Railway's public `PORT` and Fastify
on the private loopback port `3001`. Next.js proxies its server-side API calls
to Fastify, so the browser has one public URL.

## One-time Railway setup

1. Keep the existing Postgres service and its volume.
2. Keep `pytrade_v2_web`, connect it to the repository's `main` branch, and
   enable **GitHub autodeploys**. Railway will deploy every push to `main`.
3. Remove the separate `pytrade_v2_api` service after the consolidated web
   service has completed a successful deployment. It is no longer used.
4. In `pytrade_v2_web` set **Config as Code** to `/railway.json` and add a
   public domain. The configuration pins the application to one replica.

Set these variables on `pytrade_v2_web`:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
API_BASE_URL=http://127.0.0.1:3001
API_PORT=3001
WEB_ORIGIN=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
DEMO_USERNAME=demouser
DEMO_CLERK_USER_ID=user_...
DEMO_USER_EMAIL=demo@example.com
```

Create the `demo@example.com` identity in Clerk first, then put that Clerk
user's `user_...` identifier in `DEMO_CLERK_USER_ID`. The pre-deploy command
applies database migrations and safely replaces only that user's generated
demo portfolio on every deployment.

In Clerk, add the Railway public domain to the allowed origin / redirect URL
configuration. This is required for sign-in and token validation.

## CI and CD

`.github/workflows/ci.yml` runs linting, builds, tests, browser tests, and
PostgreSQL integration tests on **every push** and pull request. Railway's
GitHub autodeploy then deploys each push to `main`; no deploy token or separate
GitHub Action is needed.
