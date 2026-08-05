# PyTrade demo deployment on AWS Lightsail

This deployment runs the web application, Fastify API, PostgreSQL, and Caddy
on one Lightsail virtual machine. Docker Compose keeps the services isolated
and reproducible; Lightsail itself is the virtual machine, not a managed
container runtime.

## One-time AWS setup

1. In the Lightsail console, create an Ubuntu 24.04 instance named
   `pytrade-demo`. Use the 2 GB RAM plan.
2. Attach a static IP address.
3. In the instance Networking tab, allow inbound TCP ports 80 and 443.
4. At the domain registrar, create an `A` record for the chosen hostname that
   points to the static IP. For example, `demo.example.com` should point to the
   Lightsail static IP.

## Server setup

Use **Connect using SSH** in the Lightsail console and run:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu

# Give image builds headroom on the small instance.
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo mkdir -p /opt/pytrade
sudo chown -R ubuntu:ubuntu /opt/pytrade
```

Close and reopen the SSH session so the Docker group membership is applied.

Create `/opt/pytrade/.env`:

```dotenv
DOMAIN=demo.example.com

POSTGRES_USER=pytrade
POSTGRES_PASSWORD=replace_with_a_long_url_safe_random_password
POSTGRES_DB=pytrade
DATABASE_URL=postgresql://pytrade:replace_with_a_long_url_safe_random_password@db:5432/pytrade

API_BASE_URL=http://api:3001
API_PORT=3001
WEB_ORIGIN=https://demo.example.com
NEXT_PUBLIC_APP_URL=https://demo.example.com

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_KEY=
SNAPTRADE_USER_ID=
SNAPTRADE_USER_SECRET=
SNAPTRADE_WS_ACCOUNT_ID=
ALPHA_VANTAGE_API_KEY=
TIINGO_API_TOKEN=
EODHD_TOKEN=
```

Run `chmod 600 /opt/pytrade/.env`. Never commit this file. The deploy workflow
explicitly excludes it.

## Clerk configuration

In Clerk, configure the production instance to use your HTTPS domain. Add:

```text
https://demo.example.com
https://demo.example.com/sign-in
https://demo.example.com/sign-up
```

Use the production Clerk publishable and secret keys in the server `.env`.

## Automatic deployment from GitHub Actions

On a computer with OpenSSH, create a dedicated deployment key:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\pytrade_lightsail_deploy" -C "pytrade-github-deploy"
Get-Content "$env:USERPROFILE\.ssh\pytrade_lightsail_deploy.pub"
```

Copy the public key. In the Lightsail browser SSH session, add it to the
`ubuntu` user's authorized keys:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

In GitHub repository settings, create these Actions secrets:

- `LIGHTSAIL_HOST`: the static IP address.
- `LIGHTSAIL_SSH_KEY`: the full private-key file contents from
  `pytrade_lightsail_deploy` (not the `.pub` file).

Pushing to `main` now copies the application source, builds the Docker image,
runs migrations, and restarts the services. The first deploy also has Caddy
obtain the HTTPS certificate once DNS has propagated.

## Inspecting the running demo

From Lightsail browser SSH:

```bash
cd /opt/pytrade
docker compose ps
docker compose logs --tail=100 caddy
docker compose logs --tail=100 web
docker compose logs --tail=100 api
```

## Demo backup

This is a single-server demo. A local database dump helps recover from an
application mistake, but not loss of the whole server:

```bash
cd /opt/pytrade
set -a && . ./.env && set +a
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "pytrade-$(date +%F).sql.gz"
```
