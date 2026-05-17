# Redirect Service

This service provides a Fastify API for video, product, domain, and redirect management.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file next to `src/config.js`:

```ini
PORT=4000
INTERNAL_SERVICE_KEY=replace-this-with-a-strong-secret
PUBLIC_BASE_URL=http://localhost:4000
CORS_ORIGIN=*
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=redirect_service
```

3. Start the service:

```bash
npm start
```

## API overview

- `GET /r/:short_path` — public redirect route registered at the root level, not under `/api/v1`; for example `http://localhost:4000/r/teste`
- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/videos`
- `POST /api/v1/videos`
- `PATCH /api/v1/videos/:id`
- `DELETE /api/v1/videos/:id`
- `GET /api/v1/videos/:id/products` — product links for a video/campaign, including product position and click count
- `POST /api/v1/videos/:id/products`
- `GET /api/v1/products`
- `POST /api/v1/products`
- `PATCH /api/v1/products/:id`
- `POST /api/v1/products/:id/replace-link`
- `GET /api/v1/domains`
- `POST /api/v1/domains`
- `PATCH /api/v1/domains/:id`
- `GET /api/v1/redirects`
- `GET /api/v1/redirects/analytics`
- `POST /api/v1/redirects`
- `PATCH /api/v1/redirects/:id`

## Authentication

All API routes require `x-service-key` header or `Authorization: Bearer <key>` to match `INTERNAL_SERVICE_KEY`.
The public redirect route `/r/:short_path` and health routes are unauthenticated.

## Production Deployment

Copy `.env.production.example` to `.env.production`, replace every placeholder, then validate:

```bash
npm run validate:prod-env -- .env.production
```

Start the VPS stack with explicit env interpolation:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Set `PUBLIC_BASE_URL` and `RDI_PUBLIC_BASE_URL` to your HTTPS redirect domain, for example `https://redirects.example.com`. Set `CORS_ORIGIN` to explicit HTTPS origins, for example `https://site.example.com,https://redirects.example.com`. Replace the example domains in `deploy/nginx/conf.d/redirect-service.conf` before deploy.

The default Nginx config is HTTP-only so the container can start before certificates exist. First deploy with `deploy/nginx/conf.d/redirect-service.conf`, issue certificates into `deploy/nginx/ssl`, then replace the active config with `deploy/nginx/templates/redirect-service.https.conf` after updating the example domains and certificate paths. Restart nginx after the HTTPS config is active.

For dry-run validation against a differently named env file, set `APP_ENV_FILE`, for example `APP_ENV_FILE=.env.production.example docker compose --env-file .env.production.example -f docker-compose.prod.yml config`.

## Response format

Standard JSON response:

```json
{
  "status": "ok",
  "data": { ... }
}
```

Errors return:

```json
{
  "status": "error",
  "message": "description",
  "code": "ERROR_CODE"
}
```
