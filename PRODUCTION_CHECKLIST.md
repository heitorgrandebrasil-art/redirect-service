# Production Deployment Checklist

Before deploy
- [ ] Provision the VPS (Ubuntu 22.04+)
- [ ] Point DNS records to the VPS
- [ ] Prepare `.env.production` with safe secrets and do not commit it
- [ ] Set `PUBLIC_BASE_URL=https://redirects.example.com`
- [ ] Set `RDI_PUBLIC_BASE_URL=https://redirects.example.com`
- [ ] Set `CORS_ORIGIN` to explicit HTTPS origins
- [ ] Set `WP_DB_ROOT_PASSWORD` to a strong secret
- [ ] Run `npm run validate:prod-env -- .env.production`
- [ ] Build or prepare the API Docker image

First boot on VPS
- [ ] Install Docker and Docker Compose
- [ ] Copy `docker-compose.prod.yml`, `deploy/`, and `.env.production` to the VPS
- [ ] Replace example domains in `deploy/nginx/conf.d/redirect-service.conf`
- [ ] Start with the default HTTP-only Nginx bootstrap config
- [ ] Confirm `http://redirects.example.com/nginx-health` returns `ok`
- [ ] Obtain Let's Encrypt certificates or install Origin CA certificates into `deploy/nginx/ssl`
- [ ] Copy `deploy/nginx/templates/redirect-service.https.conf` to `deploy/nginx/conf.d/redirect-service.conf`
- [ ] Replace example domains and certificate paths in the HTTPS config
- [ ] Restart nginx after certificates exist

Deploy
- [ ] `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`
- [ ] Check API logs: `docker compose -f docker-compose.prod.yml logs -f api`
- [ ] Test health: `curl -sS https://redirects.example.com/api/v1/health`
- [ ] Test readiness with database: `curl -sS https://redirects.example.com/api/v1/ready`
- [ ] Activate the WordPress plugin
- [ ] Configure plugin `API URL` as `https://redirects.example.com/api/v1`
- [ ] Configure plugin `Public Base URL` as `https://redirects.example.com`
- [ ] Configure plugin `Internal Service Key` to match `INTERNAL_SERVICE_KEY`

Post deploy
- [ ] Configure database backups
- [ ] Configure monitoring and alerts
- [ ] Confirm TLS redirects and Cloudflare rules
- [ ] Review firewall and admin access controls
