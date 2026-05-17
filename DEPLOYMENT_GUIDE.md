# VPS Deployment Preparation Guide

This guide describes the production flow for `redirect-service` on a VPS with Docker Compose, Nginx, PostgreSQL, and WordPress.

## Requirements

- Ubuntu 22.04+ or similar
- Docker and Docker Compose v2
- DNS records pointing to the VPS
- A production `.env.production` file that is not committed

## Production Environment

Create `.env.production` from `.env.production.example`, replace every placeholder, and validate it before deploy:

```bash
npm run validate:prod-env -- .env.production
```

Required production values include:

```ini
NODE_ENV=production
INTERNAL_SERVICE_KEY=your-strong-shared-secret
PUBLIC_BASE_URL=https://redirects.example.com
CORS_ORIGIN=https://site.example.com,https://redirects.example.com
PGHOST=db
PGPORT=5432
PGUSER=rs_user
PGPASSWORD=your-strong-postgres-password
PGDATABASE=redirect_service
RDI_API_URL=http://api:4000/api/v1
RDI_PUBLIC_BASE_URL=https://redirects.example.com
RDI_INTERNAL_SERVICE_KEY=your-strong-shared-secret
WP_DB_USER=wp
WP_DB_PASSWORD=your-strong-wordpress-password
WP_DB_ROOT_PASSWORD=your-strong-wordpress-root-password
WP_DB_NAME=wordpress
TRUST_PROXY=true
```

`INTERNAL_SERVICE_KEY` and `RDI_INTERNAL_SERVICE_KEY` must match. `PUBLIC_BASE_URL`, `RDI_PUBLIC_BASE_URL`, and every `CORS_ORIGIN` entry must use explicit `https://` URLs in production.

## First Boot Nginx Flow

The active config at `deploy/nginx/conf.d/redirect-service.conf` is intentionally HTTP-only. It lets Nginx start before Let's Encrypt certificates exist and exposes `/.well-known/acme-challenge/`.

1. Replace `redirects.example.com`, `site.example.com`, and `www.site.example.com` in `deploy/nginx/conf.d/redirect-service.conf`.
2. Start the stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

3. Confirm Nginx is reachable:

```bash
curl -sS http://redirects.example.com/nginx-health
```

4. Issue certificates into the mounted `deploy/nginx/ssl` path, or install Cloudflare Origin CA certificates there.
5. Copy the HTTPS template into the active config:

```bash
cp deploy/nginx/templates/redirect-service.https.conf deploy/nginx/conf.d/redirect-service.conf
```

6. Replace example domains and certificate paths in the HTTPS config.
7. Restart only Nginx:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart nginx
```

## Production Checks

After HTTPS is active:

```bash
curl -sS https://redirects.example.com/api/v1/health
curl -sS https://redirects.example.com/api/v1/ready
curl -I https://redirects.example.com/r/teste
```

`/api/v1/health` checks the API process. `/api/v1/ready` also verifies database reachability.

## WordPress Notes

- Activate `Redirect Service Integration`.
- Set plugin `API URL` to `https://redirects.example.com/api/v1`.
- Set plugin `Public Base URL` to `https://redirects.example.com`.
- Set plugin `Internal Service Key` to the same value as `INTERNAL_SERVICE_KEY`.
- Leave `RDI_DEBUG` unset in production. Admin-side debug details are only exposed when `RDI_DEBUG=1`, `true`, `yes`, or `on`.

## Operations

- Keep database services on the internal Docker network only.
- Configure database backups with `pg_dump` or VPS volume snapshots.
- Monitor Docker healthchecks for `db`, `api`, `wordpress`, and `nginx`.
- Do not commit `.env.production` or copied certificate material.
